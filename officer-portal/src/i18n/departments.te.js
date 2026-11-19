import { getLang } from './lang'

// The ten source systems' names and how each connects, as the service sends them. Fixed list; first draft for the Telugu reviewer.
const TE = {
  'Civil registration (CRS)': 'పౌర నమోదు (CRS)',
  'Identity reference service': 'గుర్తింపు సూచిక సేవ',
  'Revenue: certificates': 'రెవెన్యూ: ధృవీకరణ పత్రాలు',
  'Revenue: land records': 'రెవెన్యూ: భూ రికార్డులు',
  'Civil supplies (PDS)': 'పౌర సరఫరాలు (PDS)',
  'Social security / pension MIS': 'సామాజిక భద్రత / పింఛను MIS',
  'Electricity distribution': 'విద్యుత్ పంపిణీ',
  'Education / scholarship': 'విద్య / ఉపకార వేతనం',
  'Housing': 'గృహనిర్మాణం',
  'Marriage register': 'వివాహ నమోదు పుస్తకం',
  'REST API + event feed': 'REST API + ఈవెంట్ ఫీడ్',
  'REST API (rate limited)': 'REST API (వేగ పరిమితితో)',
  'Read-only database views': 'చదవడానికి మాత్రమే డేటాబేస్ వ్యూలు',
  'Daily batch file (SFTP, CSV)': 'రోజువారీ బ్యాచ్ ఫైల్ (SFTP, CSV)',
  'Legacy SOAP service': 'పాత SOAP సేవ',
  'Web portal only (operator-keyed)': 'వెబ్ పోర్టల్ మాత్రమే (ఆపరేటర్ నమోదు)',
  'REST API (partial coverage)': 'REST API (పాక్షిక కవరేజ్)',
}

/** Telugu for a department name or connection description; anything else is returned unchanged. */
export const deptTe = (s) => (getLang() === 'te' && typeof s === 'string' && TE[s]) || s

/** In the Telugu view, replaces department names anywhere in a service answer (exact matches only). */
export function localizeDepartments(v) {
  if (getLang() !== 'te') return v
  const walk = (x) => {
    if (typeof x === 'string') return TE[x] || x
    if (Array.isArray(x)) return x.map(walk)
    if (x && typeof x === 'object') { const o = {}; for (const k in x) o[k] = walk(x[k]); return o }
    return x
  }
  return walk(v)
}
