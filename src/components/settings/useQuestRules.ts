import { useCallback, useEffect, useRef, useState } from 'react';
import { getRewardSettings, saveRewardSettings } from '../../lib/api';
import { validateRewardSettings, type RewardSettings } from '../../lib/rewardRules';

export interface QuestRulesDocument { revision: number; value?: RewardSettings }
type Loaded = { root: string; document?: QuestRulesDocument; error?: string };

export function useQuestRules(root?: string) {
  const [loaded, setLoaded] = useState<Loaded>();
  const [attempt, setAttempt] = useState(0);
  const active = useRef(root);
  useEffect(() => {
    active.current = root;
    if (!root) return;
    let cancelled = false;
    void (async () => {
      try {
        const raw = await getRewardSettings(root);
        let document: QuestRulesDocument = { revision: 0 };
        if (raw !== null) {
          if (!raw || typeof raw !== 'object' || !('revision' in raw) || typeof raw.revision !== 'number' || !Number.isSafeInteger(raw.revision) || raw.revision < 1 || !('state' in raw)) throw new Error('The saved XP settings could not be read.');
          validateRewardSettings(raw.state);
          document = { revision: raw.revision, value: raw.state };
        }
        if (!cancelled) setLoaded({ root, document });
      } catch (error) {
        if (!cancelled) setLoaded({ root, error: String(error) });
      }
    })();
    return () => { cancelled = true; };
  }, [root, attempt]);
  const save = useCallback(async (revision: number, value: RewardSettings) => {
    if (!root || active.current !== root) throw new Error('The vault has changed. Reopen its quest settings.');
    const next = await saveRewardSettings(root, revision, value);
    if (active.current !== root) throw new Error('The vault changed while saving quest settings.');
    setLoaded({ root, document: { revision: next, value } });
  }, [root]);
  const current = loaded?.root === root ? loaded : undefined;
  return { document: current?.document, error: current?.error, retry: () => setAttempt((n) => n + 1), save };
}
