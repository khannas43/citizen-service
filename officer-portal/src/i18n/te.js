import mdm from './te.mdm'
import decisions from './te.decisions'
import uc4 from './te.uc4'
import uc5 from './te.uc5'

// Telugu for the officer portal. The English text is the key. Add a line here to translate a string; leave it out and it shows in English.
export default {
  ...mdm,
  ...decisions,
  ...uc4,
  ...uc5,
  // header and chrome
  'Officer Services': 'అధికారి సేవలు', 'Workflow': 'వర్క్‌ఫ్లో', 'Architecture': 'ఆర్కిటెక్చర్', 'Logout': 'లాగ్ అవుట్', 'Menu': 'మెనూ',
  'Show menu': 'మెనూ చూపు', 'Hide menu': 'మెనూ దాచు', 'Collapse menu': 'మెనూ కుదించు', 'Toggle navigation panel': 'నావిగేషన్ ప్యానెల్ మార్చు',
  'Language': 'భాష',
  // groups
  'Operations': 'కార్యకలాపాలు', 'Schemes': 'పథకాలు', 'Reports & Dashboards': 'నివేదికలు & డ్యాష్‌బోర్డులు', 'Data Exchange': 'డేటా మార్పిడి',
  'Citizen & Assisted': 'పౌరుడు & సహాయక సేవ', 'Demo': 'డెమో',
  'Operate': 'నిర్వహణ', 'Identity & Family': 'గుర్తింపు & కుటుంబం', 'Govern': 'పాలన', 'Connect & reference': 'అనుసంధానం & సూచిక',
  // menu entries
  'Home': 'హోమ్', 'Ops Dashboard': 'ఆపరేషన్స్ డ్యాష్‌బోర్డ్', 'Task Queue': 'పనుల వరుస', 'Grievances': 'ఫిర్యాదులు', 'Scheme Management': 'పథకాల నిర్వహణ',
  'Scheme Content': 'పథకం కంటెంట్', 'Beneficiaries': 'లబ్ధిదారులు', 'Scheme Simulator': 'పథకం సిమ్యులేటర్', 'Money Overview': 'నిధుల అవలోకనం',
  'Expenditure': 'వ్యయం', 'Scheme Overlapping': 'పథకాల అతివ్యాప్తి', 'Scheme Coverage': 'పథకాల కవరేజ్', 'Family Registry': 'కుటుంబ రిజిస్ట్రీ',
  'Control Tower': 'కంట్రోల్ టవర్', 'Flow board': 'ప్రవాహ బోర్డు', 'Overview': 'అవలోకనం', 'Work queue': 'పని వరుస',
  'Event Stream': 'ఘటనల ప్రవాహం', 'Approvals': 'ఆమోదాలు', 'Department Notices': 'శాఖ నోటీసులు', 'Discrepancies': 'అసమతుల్యతలు',
  'Master Data': 'మాస్టర్ డేటా', 'Data Lineage': 'డేటా వంశక్రమం', 'Feed Quality': 'ఫీడ్ నాణ్యత', 'Query Builder': 'ప్రశ్న నిర్మాణం', 'Verification Queries': 'ధృవీకరణ ప్రశ్నలు',
  'Clearing House': 'క్లియరింగ్ హౌస్', 'Catalogue': 'కేటలాగ్', 'Registry': 'రిజిస్ట్రీ', 'Data Standards': 'డేటా ప్రమాణాలు', 'Consent': 'సమ్మతి', 'Policy': 'పాలసీ',
  'Response Times': 'ప్రతిస్పందన సమయాలు', 'Audit': 'ఆడిట్', 'Retention & Purge': 'నిలుపుదల & తొలగింపు', 'Connectors': 'కనెక్టర్లు', 'Security & Keys': 'భద్రత & కీలు',
  'Access & Misuse': 'ప్రాప్యత & దుర్వినియోగం', 'API Explorer': 'API ఎక్స్‌ప్లోరర్', 'My Data': 'నా డేటా', 'My Consents': 'నా సమ్మతులు', 'Report Wrong Data': 'తప్పు డేటాను నివేదించు',
  'Assisted Channel': 'సహాయక ఛానల్', 'How the Pieces Fit': 'భాగాలు ఎలా కలుస్తాయి', 'Scenario Runner': 'దృశ్యాల రన్నర్', 'Unscripted Events': 'స్క్రిప్ట్ లేని ఘటనలు',
  'Evidence Pack': 'సాక్ష్యాల ప్యాక్', 'Platform Analytics': 'ప్లాట్‌ఫాం విశ్లేషణ', 'Reports': 'నివేదికలు', 'Form Builder': 'ఫారమ్ బిల్డర్',
  // hubs and their tabs
  'Events': 'ఘటనలు', 'Trail': 'జాడ', 'Departments': 'శాఖలు', 'Notices': 'నోటీసులు', 'Response times and channels': 'ప్రతిస్పందన సమయాలు మరియు ఛానళ్లు', 'Keys': 'కీలు',
  'Reviews and quality': 'సమీక్షలు మరియు నాణ్యత', 'Rules': 'నియమాలు', 'Retention and purge': 'నిలుపుదల మరియు తొలగింపు', 'Records': 'రికార్డులు',
  'Ask and verify': 'అడగండి మరియు ధృవీకరించండి', 'Verification': 'ధృవీకరణ', 'Reference': 'సూచిక', 'Data standards': 'డేటా ప్రమాణాలు', 'API explorer': 'API ఎక్స్‌ప్లోరర్',
  'Connect and secure': 'అనుసంధానం మరియు భద్రత', 'Access and misuse': 'ప్రాప్యత మరియు దుర్వినియోగం', 'Clearing house': 'క్లియరింగ్ హౌస్', 'Query builder': 'ప్రశ్న నిర్మాణం',
  'Scenario runner': 'దృశ్యాల రన్నర్', 'Unscripted events': 'స్క్రిప్ట్ లేని ఘటనలు', 'Evidence pack': 'సాక్ష్యాల ప్యాక్', 'How the pieces fit': 'భాగాలు ఎలా కలుస్తాయి',
  'Feed quality': 'ఫీడ్ నాణ్యత', 'sections': 'విభాగాలు',
  'Decisions': 'నిర్ణయాలు', 'Rules and records': 'నియమాలు మరియు రికార్డులు', 'Eligibility checks': 'అర్హత పరిశీలనలు', 'Eligibility Checks': 'అర్హత పరిశీలనలు',
  'Consent': 'సమ్మతి', 'People': 'వ్యక్తులు', 'Review queue': 'సమీక్ష వరుస', 'Data quality': 'డేటా నాణ్యత', 'Rules & audit': 'నియమాలు & ఆడిట్',
  'At a glance': 'ఒక చూపులో', 'Issues': 'సమస్యలు', 'Turning 18': '18 ఏళ్లు నిండుతున్నవారు', 'Households': 'కుటుంబాలు',
  // messages the portal itself shows
  'The master data service cannot be reached right now.': 'మాస్టర్ డేటా సేవను ప్రస్తుతం చేరుకోలేకపోతున్నాం.',
  'Your session has expired. Sign in again.': 'మీ సెషన్ గడువు ముగిసింది. మళ్లీ సైన్ ఇన్ చేయండి.',
  'Your role does not allow this action.': 'మీ పాత్రకు ఈ చర్య అనుమతి లేదు.',
  'Civil supplies (PDS)': 'పౌర సరఫరాలు (PDS)',
  'Health': 'ఆరోగ్యం',
  'Civil supplies officer': 'పౌర సరఫరాల అధికారి',
  'Health officer': 'ఆరోగ్య అధికారి',
  'Talati': 'తలాటీ',
  'Department admin': 'శాఖ నిర్వాహకుడు',
  'IT admin': 'ఐటి నిర్వాహకుడు',
  'MDM steward': 'MDM స్టూవర్డ్',
  'MDM admin': 'MDM నిర్వాహకుడు',
  'Senior management': 'సీనియర్ నిర్వహణ',
  'Revenue officer': 'రెవెన్యూ అధికారి',
  'Scheme department': 'పథకాల శాఖ',
  'Data entry officer': 'డేటా ఎంట్రీ అధికారి',
  'Page not found': 'పేజీ కనబడలేదు',
  'This address is not a page in the Officer Portal.': 'ఈ చిరునామా అధికారి పోర్టల్‌లో ఒక పేజీ కాదు.',
  'Go to your home page': 'మీ హోమ్ పేజీకి వెళ్లండి',
  'Nothing needs a person in {dept} right now': '{dept}లో ఇప్పుడు వ్యక్తి అవసరమైనవి లేవు',
  'Items that need a person in {dept}, grouped by reason.': '{dept}లో వ్యక్తి అవసరమైన అంశాలు, కారణం వారీగా.',
  'What {dept} has received, delivered, is waiting on citizens for, and needs a person for.': '{dept} ఏమి అందుకుంది, అందజేసింది, పౌరుల కోసం వేచి ఉంది, వ్యక్తి అవసరం.',
  'PDS_OFFICER': 'పౌర సరఫరాల అధికారి',
  'HEALTH_OFFICER': 'ఆరోగ్య అధికారి',

  'The request failed ({status}).': 'అభ్యర్థన విఫలమైంది ({status}).',
  'The download failed ({status}).': 'డౌన్‌లోడ్ విఫలమైంది ({status}).',
  'The upload failed ({status}).': 'అప్‌లోడ్ విఫలమైంది ({status}).',
}
