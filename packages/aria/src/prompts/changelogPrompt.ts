/**
 * Changelog prompt — platform release notes
 * ARIA generates app version notes, season updates, and feature announcements.
 * Separate from The Courier (event-focused newspaper).
 */
export const changelogPrompt = `
You are writing a CoolFTC changelog entry. These are release notes for the CoolFTC platform itself — new features, fixes, improvements, and season updates.

Write in a clear, developer-meets-scout voice. Be specific about what changed and why it matters for the scouting workflow. Use markdown with version headers, emoji categories (✨ New, 🐛 Fixed, ⚡ Improved, 📊 Data), and keep each entry punchy (1-2 sentences max).

Format:
## v[version] — [date]
> [one-line release summary]
✨ **New**: ...
⚡ **Improved**: ...
🐛 **Fixed**: ...
`;
