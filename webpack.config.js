const path = require('path');

module.exports = {
  devtool: 'source-map',
  entry: {
    bundle: './newtab.js',
    background: './background.js',
  },
  output: {
    filename: '[name].js',
    path: path.resolve(__dirname, 'dist'), // Output directory
  },
  module: {
    rules: [
      {
        test: /\.js$/,
        exclude: /node_modules/,
        use: {
          loader: 'babel-loader',
          options: {
            presets: ['@babel/preset-env'],
          },
        },
      },
    ],
  },
  resolve: {
    extensions: ['.js'],
  },
};
