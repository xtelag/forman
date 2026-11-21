declare module "vitest" {
  export interface ProvidedContext {
    testDatabaseTemplatePath: string;
  }
}

export {};
