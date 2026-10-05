/** Replaces mock/sap.ts in every normal build (see next.config.mjs): no mock data ships to users. */
export const mockSapFetch = (): Promise<Response> => Promise.reject(new Error('Mock SAP is not part of this build.'));
export const mockRequestLog: string[] = [];
