export const toolRegistry = {
  gmail: {
    name: 'gmail',
    status: 'placeholder',
    description: 'Would be needed for email drafting, inbox review, or sending email after approval.'
  },
  google_maps: {
    name: 'google_maps',
    status: 'placeholder',
    description: 'Would be needed for locations, routes, places, or travel distance requests.'
  },
  hubspot: {
    name: 'hubspot',
    status: 'placeholder',
    description: 'Would be needed for CRM contacts, leads, deals, and pipeline updates.'
  },
  browser: {
    name: 'browser',
    status: 'placeholder',
    description: 'Would be needed for web research, checking websites, or online information.'
  },
  calendar: {
    name: 'calendar',
    status: 'placeholder',
    description: 'Would be needed for scheduling, reminders, meetings, and calendar changes.'
  }
};

const toolSignals = [
  { tool: 'gmail', pattern: /\b(email|gmail|inbox|send mail|message a lead|envoyer.*mail|imel|kouryel)\b/i },
  { tool: 'google_maps', pattern: /\b(map|maps|route|location|address|directions|google maps|itineraire|adresse|lokalizasyon)\b/i },
  { tool: 'hubspot', pattern: /\b(hubspot|crm|lead|deal|pipeline|contact|prospect)\b/i },
  { tool: 'browser', pattern: /\b(browser|website|web|research|search online|look up|site web|recherche|verify online)\b/i },
  { tool: 'calendar', pattern: /\b(calendar|meeting|appointment|schedule|reminder|calendrier|rendez-vous|reyinyon|raple)\b/i }
];

export function listTools() {
  return Object.values(toolRegistry);
}

export function getTool(name) {
  return toolRegistry[name] ?? null;
}

export function detectNeededTool(message = '') {
  const signal = toolSignals.find((item) => item.pattern.test(message));
  if (!signal) {
    return null;
  }
  return getTool(signal.tool);
}
