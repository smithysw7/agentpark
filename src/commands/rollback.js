import { rollbackLast } from '../util.js';
import { emit } from '../output.js';

export function cmdRollback(opts) {
  const entry = rollbackLast();
  emit({ rolledBack: entry }, opts.json, () =>
    entry
      ? [
          `✓ 已回滚: ${entry.originalPath}`,
          `  （从备份 ${entry.backupPath} 恢复；回滚前的状态也已留有备份，可再次 rollback 撤销）`,
        ]
      : ['没有可回滚的备份（backups/index.json 为空）']
  );
}
