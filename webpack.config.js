'use strict';

const path = require('path');
const shell = require('shelljs');

const MiniCssExtractPlugin = require('mini-css-extract-plugin');
var RemoveEmptyScriptsPlugin = require('webpack-remove-empty-scripts');
var CssMinimizerPlugin = require('css-minimizer-webpack-plugin');
const CopyPlugin = require('copy-webpack-plugin');

// Local, forward-slash-safe replacements for sgmfScripts.createJsPath()/createScssPath().
// sgmf-scripts@4 bumped shelljs to 0.10 (fast-glob based); fast-glob treats backslashes
// as escape characters, so the path.join() globs in sgmf-scripts/lib/helpers.js match
// nothing on Windows. Building the glob with '/' separators makes it work everywhere.
const CARTRIDGE = 'int_cybs_sfra';
const clientDir = path.resolve(`./cartridges/${CARTRIDGE}/cartridge/client`);
const toPosix = (p) => p.split(path.sep).join('/');

function createJsPath() {
    const result = {};
    shell.ls(`${toPosix(clientDir)}/**/js/*.js`).forEach((filePath) => {
        let location = toPosix(path.relative(clientDir, filePath));
        location = location.substr(0, location.length - 3);
        result[location] = filePath;
    });
    return result;
}

function createScssPath() {
    const result = {};
    shell.ls(`${toPosix(clientDir)}/**/scss/**/*.scss`).forEach((filePath) => {
        const name = path.basename(filePath, '.scss');
        if (name.indexOf('_') !== 0) {
            let location = toPosix(path.relative(clientDir, filePath));
            location = location.substr(0, location.length - 5).replace('scss', 'css');
            result[location] = filePath;
        }
    });
    return result;
}


module.exports = [{
    mode: 'production',
    name: 'js',
    entry: createJsPath(),
    output: {
        path: path.resolve('./cartridges/int_cybs_sfra/cartridge/static'),
        filename: '[name].js'
    },
    plugins: [
        new CopyPlugin({
            patterns: [
                {
                    from: path.resolve('./cartridges/int_cybs_sfra/cartridge/client/default/custom'),
                    to: path.resolve('./cartridges/int_cybs_sfra/cartridge/static/default/custom')
                },
            ],
        })
    ]
},
{
    mode: 'none',
    name: 'scss',
    entry: createScssPath(),
    output: {
        path: path.resolve('./cartridges/int_cybs_sfra/cartridge/static'),
    },
    module: {
        rules: [
            {
                test: /\.scss$/,
                use: [
                    {
                        loader: MiniCssExtractPlugin.loader,
                        options: {
                            esModule: false
                        }
                    },
                    {
                        loader: 'css-loader',
                        options: {
                            url: false
                        }
                    },
                    {
                        loader: 'postcss-loader',
                        options: {
                            postcssOptions: {
                                plugins: [require('autoprefixer')()]
                            }
                        }
                    },
                    {
                        loader: 'sass-loader',
                        options: {
                            implementation: require('sass'),
                            sassOptions: {
                                includePaths: [
                                    path.resolve(
                                        process.cwd(),
                                        '../storefront-reference-architecture/node_modules/'
                                    ),
                                    path.resolve(
                                        process.cwd(), // eslint-disable-next-line max-len
                                        '../storefront-reference-architecture/node_modules/flag-icon-css/sass'
                                    )]
                            }
                        }
                    }
                ]
            }
        ]
    },

    plugins: [
        new RemoveEmptyScriptsPlugin(),
        new MiniCssExtractPlugin({ filename: '[name].css', chunkFilename: '[name].css' }),
        new CopyPlugin({
            patterns: [
                {
                    from: path.resolve('./cartridges/int_cybs_sfra/cartridge/client/default/images'),
                    to: path.resolve('./cartridges/int_cybs_sfra/cartridge/static/default/images')
                },
            ],
        })
    ],
    optimization: {
        minimizer: ['...', new CssMinimizerPlugin()]
    }
}];