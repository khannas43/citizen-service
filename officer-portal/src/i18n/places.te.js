// Telugu names of the state's districts: a fixed list, so these never go through machine translation. First draft for the Telugu reviewer.
// Villages and mandals are not listed here; they are transliterated by the translation service (shown as machine-written).
const DISTRICTS = {
  adilabad: 'ఆదిలాబాద్', bhadradrikothagudem: 'భద్రాద్రి కొత్తగూడెం', hanumakonda: 'హనుమకొండ', hyderabad: 'హైదరాబాద్',
  jagtial: 'జగిత్యాల', jangaon: 'జనగాం', jayashankarbhupalpally: 'జయశంకర్ భూపాలపల్లి', jogulambagadwal: 'జోగులాంబ గద్వాల',
  kamareddy: 'కామారెడ్డి', karimnagar: 'కరీంనగర్', khammam: 'ఖమ్మం', kumurambheemasifabad: 'కుమురం భీం ఆసిఫాబాద్',
  mahabubabad: 'మహబూబాబాద్', mahabubnagar: 'మహబూబ్‌నగర్', mancherial: 'మంచిర్యాల', medak: 'మెదక్',
  medchalmalkajgiri: 'మేడ్చల్–మల్కాజిగిరి', mulugu: 'ములుగు', nagarkurnool: 'నాగర్‌కర్నూల్', nalgonda: 'నల్గొండ',
  narayanpet: 'నారాయణపేట', nirmal: 'నిర్మల్', nizamabad: 'నిజామాబాద్', peddapalli: 'పెద్దపల్లి',
  rajannasircilla: 'రాజన్న సిరిసిల్ల', rangareddy: 'రంగారెడ్డి', sangareddy: 'సంగారెడ్డి', siddipet: 'సిద్దిపేట',
  suryapet: 'సూర్యాపేట', vikarabad: 'వికారాబాద్', wanaparthy: 'వనపర్తి', warangal: 'వరంగల్', yadadribhuvanagiri: 'యాదాద్రి భువనగిరి',
}
const key = (s) => String(s || '').toLowerCase().replace(/\bdistrict\b/g, '').replace(/[^a-z]/g, '')

/** The Telugu name of a district, or null when the text is not a known district. */
export function placeTe(text) {
  return DISTRICTS[key(text)] || null
}
