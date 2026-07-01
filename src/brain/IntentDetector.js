const intentSignals = [
  {
    intent: 'greeting',
    pattern: /^(hi|hello|hey|bonjour|bonsoir|salut|bonjou|bonswa|sak pase|sa k ap fèt|kijan ou ye)\b/i
  },
  {
    intent: 'research',
    pattern: /\b(research|search|look up|find information|verify|source|sources|recherche|chercher|trouve des infos|verifye|chache)\b/i
  },
  {
    intent: 'action',
    pattern: /\b(send|publish|delete|create event|schedule|book|pay|update crm|envoyer|publier|supprimer|planifier|payer|modifye|voye)\b/i
  },
  {
    intent: 'task',
    pattern: /\b(make a plan|plan|prepare|draft|organize|summarize|analyze|crée|creer|prépare|prepare|organise|résume|resume|analyse|fè yon plan)\b/i
  },
  {
    intent: 'question',
    pattern: /(^|\b)(what|why|how|when|where|who|which|can you|could you|comment|pourquoi|quand|où|qui|quoi|kijan|poukisa|ki kote|kilè|eske)\b|\?$/i
  }
];

export class IntentDetector {
  detect(message = '') {
    const text = String(message).trim();

    for (const signal of intentSignals) {
      if (signal.pattern.test(text)) {
        return signal.intent;
      }
    }

    return 'conversation';
  }
}
