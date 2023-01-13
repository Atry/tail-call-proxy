const { pathsToModuleNameMapper } = require('ts-jest');
const requireJSON5 = require('require-json5');
const { compilerOptions } = requireJSON5('./tsconfig.json');

module.exports = {
  preset: 'ts-jest',
  testEnvironment: 'node',
  testMatch: ['**/test/**/*.spec.ts', '**/test/**/*.test.ts'],
  collectCoverageFrom: [
    '<rootDir>/src/**/*.ts',
    '!<rootDir>/src/types/**/*.ts',
  ],
  globals: {
    'ts-jest': {
      diagnostics: false,
      isolatedModules: true,
    },
  },
  moduleNameMapper: pathsToModuleNameMapper(compilerOptions.paths),
};
