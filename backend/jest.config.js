const path = require("path");

/** @type {import("jest").Config} **/
module.exports = {
  testEnvironment: "node",

  // Use ts-jest with node16 moduleResolution to avoid TS6 node10 deprecation warning
  transform: {
    "^.+\.tsx?$": [
      "ts-jest",
      {
        tsconfig: {
          moduleResolution: "node16",
          module: "commonjs",
          esModuleInterop: true,
        },
      },
    ],
  },

  // Resolve @shared/* path alias at Jest runtime
  moduleNameMapper: {
    "^@shared/(.*)$": path.resolve(__dirname, "../shared/$1"),
  },

  // Exclude compiled output — only run .ts source files
  testPathIgnorePatterns: ["/node_modules/", "/dist/"],

  // Coverage configuration
  collectCoverageFrom: [
    "src/**/*.ts",
    "!src/**/*.test.ts",
    "!src/**/*.d.ts",
    "!src/server.ts",   // entrypoint — not testable in unit context
  ],
  coverageThresholds: {
    global: {
      statements: 70,
      branches: 60,
      functions: 70,
      lines: 70,
    },
  },
};