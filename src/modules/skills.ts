import type { Bridge } from '../bridge';
import type { Skill, SkillResult, ChatableXSkills } from '../types';

export function createSkillsModule(bridge: Bridge): ChatableXSkills {
  return {
    list(): Promise<Skill[]> {
      return bridge.sendMessage('skills.list', {}) as Promise<Skill[]>;
    },

    execute(skillId: string, variables: Record<string, unknown>): Promise<SkillResult> {
      return bridge.sendMessage('skills.execute', { skillId, variables }) as Promise<SkillResult>;
    },
  };
}
