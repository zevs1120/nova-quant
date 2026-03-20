export function createNoopNovaRepo() {
  return {
    listPromptVersions() {
      return [];
    },
    upsertNovaTaskRun() {},
    upsertWorkflowRun() {},
    insertAuditEvent() {}
  };
}
