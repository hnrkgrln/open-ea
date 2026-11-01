export const MAX_LLM_SKILLS = 24;
export const MAX_SKILL_NAME = 80;
export const MAX_SKILL_BODY = 12000;
const SKILL_PROMPT_BUDGET = 24_000;

export const DIAGRAM_SKILL_ID = 'diagrams';

const DIAGRAM_SKILL_BODY = `When someone asks to see, show, draw, or diagram a slice of the portfolio, answer in the usual way and include a markdown link to the Diagrams view. The chat embeds that link as the diagram, and the same link opens the view. Do not describe a diagram you cannot link, and do not invent a path, a record id, or a picture.

The href is a path that starts with /diagrams. Put the view in the query string. A /diagrams link is allowed. Do not invent an /apps/ link. Percent-encode spaces as %20. The link text is a short name for the view, for example [Applications to eliminate](/diagrams?mode=app-landscape&time=ELIMINATE).

Landscape is the mode parameter. Leave mode off for the capability landscape.
- landscape — capabilities, with the applications that support them
- app-landscape — applications
- org-landscape — organizations, with the applications each one owns
- network — integrations between applications

Use landscape for a capability or for what the business does. Use app-landscape for the application portfolio. Use org-landscape for ownership or accountability. Use network for flows, payloads, or integrations.

Color the boxes with overlay. It is optional. Use one of lifecycle, time, cost, functionalFit, or technicalFit. criticality is allowed only with app-landscape, org-landscape, or network.

Group the boxes with group. It is optional, and it is not available on network. Use one of lifecycle, time, criticality, cost, functionalFit, or technicalFit.

Focus the canvas with q. Repeat q once per name, as in q=One&q=Two. Use a name from the workspace data. Matching ignores letter case and keeps a name that contains the text. Several q values keep only what matches every one of them.
- On landscape, q matches a capability name, or an application name when no capability name matches.
- On app-landscape, q matches an application name or the name of a capability it supports.
- On org-landscape, q matches an organization name, or an application name when no organization name matches.
- On network, q matches an application, its owning organization, an integration name, a payload, a pattern, or a CRUD value.

The other filters take the stored value shown in the workspace data. Join several values for the same filter with a comma. Combine different filters with &.
- time is INVEST, MIGRATE, TOLERATE, or ELIMINATE. The workspace data writes these as Invest, Migrate, Tolerate, and Eliminate. The URL uses those exact uppercase words.
- lifecycle, type, owner, crit, cost, func, and tech use the value after lifecycle, type, owner, criticality, cost, functional fit, and technical fit.
- orgType is the organization type. info, pii, confidentiality, integrity, and availability are the information scores. pattern, frequency, and crud are the integration values.
- meta_<field name> is a custom attribute value. Use the field name, not its label.

Do not put a record id in the URL. Names belong in q. Decommissioned applications stay hidden unless lifecycle includes their lifecycle value.

One link is enough unless the user asks for more than one view. A capability named Customer Management is [Customer Management](/diagrams?mode=landscape&q=Customer%20Management). Integrations that carry a payload named Employee are [Employee flows](/diagrams?mode=network&q=Employee).`;

export type BuiltinSkill = {
  id: string;
  name: string;
  body: string;
};

export const BUILTIN_SKILLS: BuiltinSkill[] = [
  {
    id: DIAGRAM_SKILL_ID,
    name: 'Diagrams',
    body: DIAGRAM_SKILL_BODY,
  },
];

export type StoredSkill = {
  id: string;
  name: string;
  body: string;
  enabled: boolean;
  builtin: boolean;
  sortOrder: number;
};

export type PublicSkill = {
  id: string;
  name: string;
  body: string;
  defaultName: string | null;
  defaultBody: string | null;
  enabled: boolean;
  builtin: boolean;
  customized: boolean;
};

export function builtinSkill(id: string): BuiltinSkill | undefined {
  return BUILTIN_SKILLS.find((skill) => skill.id === id);
}

export function cleanSkillName(value: string) {
  return value.replace(/\s+/g, ' ').trim();
}

export function cleanSkillBody(value: string) {
  return value.replace(/\r\n/g, '\n').trim();
}

export function presentSkills(rows: StoredSkill[]): PublicSkill[] {
  const byId = new Map(rows.map((row) => [row.id, row]));
  const builtinIds = new Set(BUILTIN_SKILLS.map((skill) => skill.id));
  const builtins = BUILTIN_SKILLS.map((skill) => {
    const row = byId.get(skill.id);
    const name = row ? cleanSkillName(row.name) || skill.name : skill.name;
    const body = row ? cleanSkillBody(row.body) : skill.body;
    const enabled = row?.enabled ?? true;
    return {
      id: skill.id,
      name,
      body,
      defaultName: skill.name,
      defaultBody: skill.body,
      enabled,
      builtin: true,
      customized: name !== skill.name || body !== skill.body,
    };
  });
  const custom = rows
    .filter((row) => !builtinIds.has(row.id))
    .map((row) => ({
      id: row.id,
      name: cleanSkillName(row.name),
      body: cleanSkillBody(row.body),
      defaultName: null,
      defaultBody: null,
      enabled: row.enabled,
      builtin: false,
      customized: true,
    }));
  return [...builtins, ...custom];
}

export function skillInstructions(skills: Array<Pick<PublicSkill, 'name' | 'body' | 'enabled'>>): string {
  const blocks: string[] = [];
  let used = 0;
  for (const skill of skills) {
    const name = cleanSkillName(skill.name);
    const body = cleanSkillBody(skill.body);
    if (!skill.enabled || !name || !body) continue;
    const block = `## ${name}\n${body}`;
    if (used > 0 && used + block.length > SKILL_PROMPT_BUDGET) break;
    if (block.length > SKILL_PROMPT_BUDGET) break;
    blocks.push(block);
    used += block.length;
  }
  if (blocks.length === 0) return '';
  return [
    'Skills:',
    'When a skill below matches the question, follow that skill. A skill adds a way to answer. It does not add records, and it does not allow you to invent architecture data.',
    '',
    blocks.join('\n\n'),
  ].join('\n');
}
