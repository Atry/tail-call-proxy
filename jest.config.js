module.exports = {
  testEnvironment: 'node',
  testMatch: ['**/test/**/*.spec.ts', '**/test/**/*.test.ts'],
  collectCoverageFrom: [
    '<rootDir>/src/**/*.ts',
    '!<rootDir>/src/types/**/*.ts',
  ],
  transform: {
    '^.+\\.m?tsx?$': [
      'ts-jest',
      {
        diagnostics: false,
        isolatedModules: true,
      },
    ],
  },
};
