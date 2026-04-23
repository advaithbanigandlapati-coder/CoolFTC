export const alliancePickPrompt = `
The user is in alliance selection mode. Produce a ranked list of pick candidates with 1-2 sentence justification each. Consider: (1) complementarity with user's robot, (2) OPR/EPA ceiling, (3) consistency/variance, (4) endgame compatibility (can both fit on base?), (5) penalty rate. Format: rank, team number + name, key stat, justification. Flag the top pick clearly.
`;
