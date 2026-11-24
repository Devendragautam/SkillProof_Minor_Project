import type { ClaimedLevel } from "./types";

export interface SkillCatalogEntry {
  /** Canonical skill name */
  name: string;
  /** Group label shown in UI */
  group: string;
  /** Aliases used for resume matching */
  aliases: string[];
  /** Which question pools this skill can draw from */
  pools: Array<"coding" | "debugging" | "mcq">;
  /** Database `skill` values this canonical skill maps to */
  questionSkills: string[];
}

export const SKILL_CATALOG: SkillCatalogEntry[] = [
  {
    name: "DSA",
    group: "CS Core",
    aliases: ["dsa", "data structures", "data structures & algorithms", "data structures and algorithms", "algorithms", "problem solving"],
    pools: ["coding", "debugging", "mcq"],
    questionSkills: ["DSA"],
  },
  {
    name: "Algorithms",
    group: "CS Core",
    aliases: ["algorithms", "algorithm design", "greedy", "dynamic programming"],
    pools: ["coding"],
    questionSkills: ["DSA"],
  },
  {
    name: "C++",
    group: "Languages",
    aliases: ["c++", "cpp", "c/c++"],
    pools: ["debugging", "mcq"],
    questionSkills: ["C++", "OOP"],
  },
  {
    name: "Python",
    group: "Languages",
    aliases: ["python", "python3"],
    pools: ["debugging", "mcq"],
    questionSkills: ["Python"],
  },
  {
    name: "Java",
    group: "Languages",
    aliases: ["java", "core java"],
    pools: ["debugging", "mcq"],
    questionSkills: ["OOP", "Java"],
  },
  {
    name: "JavaScript",
    group: "Languages",
    aliases: ["javascript", "js", "typescript", "ts"],
    pools: ["coding", "debugging", "mcq"],
    questionSkills: ["DSA", "JavaScript"],
  },
  {
    name: "Node.js",
    group: "Backend",
    aliases: ["node.js", "nodejs", "node", "express", "express.js"],
    pools: ["debugging", "mcq"],
    questionSkills: ["Node.js", "JavaScript"],
  },
  {
    name: "DBMS",
    group: "CS Core",
    aliases: ["dbms", "sql", "mysql", "postgresql", "postgres", "database", "databases", "mongodb", "database management"],
    pools: ["coding", "mcq"],
    questionSkills: ["DBMS"],
  },
  {
    name: "Operating Systems",
    group: "CS Core",
    aliases: ["operating systems", "os", "operating system"],
    pools: ["mcq"],
    questionSkills: ["Operating Systems"],
  },
  {
    name: "Computer Networks",
    group: "CS Core",
    aliases: ["computer networks", "networking", "cn", "tcp/ip"],
    pools: ["mcq"],
    questionSkills: ["Computer Networks"],
  },
  {
    name: "OOP",
    group: "CS Core",
    aliases: ["oop", "object oriented programming", "object-oriented programming"],
    pools: ["mcq"],
    questionSkills: ["OOP"],
  },
  {
    name: "React",
    group: "Frontend",
    aliases: ["react", "react.js", "reactjs", "react.js framework"],
    pools: ["mcq"],
    questionSkills: ["React"],
  },
  {
    name: "Git",
    group: "Tooling",
    aliases: ["git", "github", "version control", "git & github"],
    pools: ["mcq"],
    questionSkills: ["Git"],
  },
];

export function canonicalizeSkill(raw: string): SkillCatalogEntry | null {
  const clean = raw.toLowerCase().trim();
  for (const entry of SKILL_CATALOG) {
    if (entry.name.toLowerCase() === clean) return entry;
    if (entry.aliases.some((a) => a === clean)) return entry;
  }
  // fuzzy contains
  for (const entry of SKILL_CATALOG) {
    if (entry.aliases.some((a) => clean.includes(a) && a.length > 2)) return entry;
  }
  return null;
}

/** Rough heuristic estimate of proficiency from resume mentions */
export function heuristicLevel(mentions: number, hasProjectMention: boolean): ClaimedLevel {
  if (mentions >= 3 || (mentions >= 2 && hasProjectMention)) return "Advanced";
  if (mentions >= 2) return "Intermediate";
  if (hasProjectMention) return "Intermediate";
  return "Basic";
}

export const LEVEL_ORDER: Record<ClaimedLevel, number> = {
  Basic: 1,
  Intermediate: 2,
  Advanced: 3,
};
