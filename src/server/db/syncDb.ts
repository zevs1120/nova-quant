export type SyncQueryArgs = unknown[] | Record<string, unknown> | undefined;

export type SyncRunResult = {
  changes: number;
  lastInsertRowid?: number | null;
};

export type SyncPreparedStatement<Row = any> = {
  run: (...args: unknown[]) => SyncRunResult;
  get: (...args: unknown[]) => Row | undefined;
  all: (...args: unknown[]) => Row[];
  iterate: (...args: unknown[]) => Iterable<Row>;
};

export type SyncTransaction<RowArgs extends unknown[] = unknown[]> = (
  ...args: RowArgs
) => ReturnType<(...args: RowArgs) => unknown>;

export type SyncDb = {
  exec: (sql: string) => void;
  prepare: (sql: string) => SyncPreparedStatement;
  transaction: <Args extends unknown[], Result>(
    fn: (...args: Args) => Result,
  ) => (...args: Args) => Result;
  pragma: (value: string) => void;
  close: () => void;
  ensureBootstrapped?: () => void;
};
