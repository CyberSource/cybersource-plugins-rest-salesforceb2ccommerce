'use strict';

/**
 * Minimal DER (ASN.1) reader — only what PKCS#12 parsing needs.
 *
 * Deliberately NOT a general ASN.1 library: it reads tag/length/value triplets, walks
 * SEQUENCE/SET children, and decodes the handful of primitive types a PFX contains
 * (OBJECT IDENTIFIER, INTEGER, OCTET STRING). Pure JavaScript with no dw/* dependencies so
 * it can be unit-tested against real .p12 fixtures outside the SFCC runtime.
 *
 * All offsets are indices into a Uint8Array. Lengths use DER definite form; BER indefinite
 * length (0x80) is rejected because DER-encoded PKCS#12 never uses it.
 */

var TAG = {
    INTEGER: 0x02,
    BIT_STRING: 0x03,
    OCTET_STRING: 0x04,
    NULL: 0x05,
    OID: 0x06,
    SEQUENCE: 0x30,
    SET: 0x31
};

/**
 * Read one byte as an unsigned 0..255 value.
 *
 * Masking is deliberate: on the SFCC (Rhino) engine a byte array bridged from Java can surface
 * values as SIGNED (-128..127), which silently breaks DER length decoding — 0x82 would read as
 * -126 and be mistaken for a short-form length. Masking makes the reader engine-independent.
 *
 * @param {Uint8Array} buf - buffer to read from
 * @param {number} i - index
 * @returns {number} the byte value, 0..255
 */
function byteAt(buf, i) {
    return buf[i] & 0xFF;
}

/**
 * Copy a byte range into a NEW Uint8Array.
 *
 * This intentionally does not use `subarray`/`slice`/`set`. Those return (or consume) views that
 * carry a byteOffset, and nesting them — a view into a view, which PKCS#12 parsing does
 * constantly — is mis-resolved on SFCC's Rhino engine: indexes came out shifted by the parent
 * header length, producing bogus DER lengths. Copying yields a buffer whose offset 0 really is
 * offset 0 on every engine, and makes the result safe to hand to `new dw.util.Bytes(...)`, which
 * may otherwise ignore a view's byteOffset.
 *
 * @param {Uint8Array} buf - source buffer
 * @param {number} start - inclusive start index
 * @param {number} end - exclusive end index
 * @returns {Uint8Array} a new buffer holding the copied bytes
 */
function copyBytes(buf, start, end) {
    var from = start < 0 ? 0 : start;
    var to = end > buf.length ? buf.length : end;
    var len = to - from;
    if (len < 0) {
        len = 0;
    }
    var out = new Uint8Array(len);
    for (var i = 0; i < len; i++) {
        out[i] = buf[from + i] & 0xFF;
    }
    return out;
}

/**
 * Read one TLV triplet starting at `offset`.
 *
 * @param {Uint8Array} buf - buffer to read from
 * @param {number} offset - index of the tag byte
 * @returns {Object} {tag, valueStart, valueEnd, end, length} — `end` is the index just past this TLV
 */
function readTlv(buf, offset) {
    if (offset + 1 >= buf.length) {
        throw new Error('asn1: truncated TLV at offset ' + offset);
    }
    var tag = byteAt(buf, offset);
    var lenByte = byteAt(buf, offset + 1);
    var length;
    var valueStart;

    if (lenByte < 0x80) {
        // Short form: length is the byte itself.
        length = lenByte;
        valueStart = offset + 2;
    } else if (lenByte === 0x80) {
        throw new Error('asn1: indefinite length is not valid DER (offset ' + offset + ')');
    } else {
        // Long form: low 7 bits give the number of subsequent length bytes (big-endian).
        var numLenBytes = lenByte & 0x7F;
        if (numLenBytes > 4) {
            throw new Error('asn1: length field too large (' + numLenBytes + ' bytes)');
        }
        length = 0;
        for (var i = 0; i < numLenBytes; i++) {
            length = (length * 256) + byteAt(buf, offset + 2 + i);
        }
        valueStart = offset + 2 + numLenBytes;
    }

    var valueEnd = valueStart + length;
    if (valueEnd > buf.length) {
        throw new Error('asn1: TLV value overruns buffer (offset ' + offset + ', length ' + length + ')');
    }
    return { tag: tag, valueStart: valueStart, valueEnd: valueEnd, end: valueEnd, length: length };
}

/**
 * Read every child TLV inside a constructed value.
 *
 * @param {Uint8Array} buf - buffer to read from
 * @param {number} start - first byte of the first child
 * @param {number} end - index just past the last child
 * @returns {Object[]} child TLVs in order
 */
function readChildren(buf, start, end) {
    var out = [];
    var pos = start;
    while (pos < end) {
        var tlv = readTlv(buf, pos);
        out.push(tlv);
        pos = tlv.end;
    }
    return out;
}

/**
 * Read the children of the constructed TLV at `offset`.
 *
 * @param {Uint8Array} buf - buffer to read from
 * @param {number} offset - index of the constructed TLV's tag byte
 * @returns {Object[]} child TLVs in order
 */
function readChildrenOf(buf, offset) {
    var tlv = readTlv(buf, offset);
    return readChildren(buf, tlv.valueStart, tlv.valueEnd);
}

/**
 * Decode an OBJECT IDENTIFIER value to dotted-decimal form.
 *
 * @param {Uint8Array} buf - buffer to read from
 * @param {Object} tlv - the OID TLV (as returned by readTlv)
 * @returns {string} e.g. '1.2.840.113549.1.12.10.1.3'
 */
function decodeOid(buf, tlv) {
    if (tlv.tag !== TAG.OID) {
        throw new Error('asn1: expected OBJECT IDENTIFIER, got tag 0x' + tlv.tag.toString(16));
    }
    var parts = [];
    var pos = tlv.valueStart;
    // First byte encodes the first two arcs: first = byte / 40, second = byte % 40.
    var first = byteAt(buf, pos++);
    parts.push(Math.floor(first / 40));
    parts.push(first % 40);
    // Remaining arcs are base-128, high bit set on all but the final byte.
    var value = 0;
    while (pos < tlv.valueEnd) {
        var b = byteAt(buf, pos++);
        value = (value * 128) + (b & 0x7F);
        if ((b & 0x80) === 0) {
            parts.push(value);
            value = 0;
        }
    }
    return parts.join('.');
}

/**
 * Decode a small INTEGER value (used for PBE iteration counts and version numbers).
 *
 * @param {Uint8Array} buf - buffer to read from
 * @param {Object} tlv - the INTEGER TLV
 * @returns {number} the integer value
 */
function decodeInteger(buf, tlv) {
    var value = 0;
    for (var i = tlv.valueStart; i < tlv.valueEnd; i++) {
        value = (value * 256) + byteAt(buf, i);
    }
    return value;
}

/**
 * Copy a TLV's value bytes out into a new Uint8Array.
 *
 * @param {Uint8Array} buf - buffer to read from
 * @param {Object} tlv - the TLV whose value should be copied
 * @returns {Uint8Array} the value bytes
 */
function valueBytes(buf, tlv) {
    return copyBytes(buf, tlv.valueStart, tlv.valueEnd);
}

/**
 * Copy a whole TLV (tag + length + value) out into a new Uint8Array. Needed for a certificate,
 * whose DER encoding is the complete SEQUENCE, not just its contents.
 *
 * @param {Uint8Array} buf - buffer to read from
 * @param {number} offset - index of the TLV's tag byte
 * @returns {Uint8Array} the full TLV bytes
 */
function fullTlvBytes(buf, offset) {
    var tlv = readTlv(buf, offset);
    return copyBytes(buf, offset, tlv.end);
}

module.exports = {
    TAG: TAG,
    byteAt: byteAt,
    copyBytes: copyBytes,
    readTlv: readTlv,
    readChildren: readChildren,
    readChildrenOf: readChildrenOf,
    decodeOid: decodeOid,
    decodeInteger: decodeInteger,
    valueBytes: valueBytes,
    fullTlvBytes: fullTlvBytes
};
