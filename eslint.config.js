'use strict';

const js = require('@eslint/js');
const globals = require('globals');

module.exports = [
    {
        ignores: [
            'cartridges/int_cybs_sfra/cartridge/static/**',
            'cartridges/int_cybs_sfra/cartridge/client/default/custom/lib/**',
            'cartridges/int_cybs_sfra_base/cartridge/apiClient/**',
            '**/*.min.js'
        ]
    },
    js.configs.recommended,
    {
        languageOptions: {
            ecmaVersion: 2020,
            sourceType: 'script',
            globals: {
                ...globals.node,
                ...globals.browser,
                ...globals.jquery,
                ...globals.mocha,
                dw: 'readonly',
                request: 'readonly',
                response: 'readonly',
                session: 'readonly',
                customer: 'readonly',
                empty: 'readonly',
                XML: 'readonly',
                XMLList: 'readonly'
            }
        },
        rules: {
            'no-unused-vars': ['warn', {
                args: 'none',
                caughtErrors: 'none',
                vars: 'all'
            }]
        }
    }
];
 