/* ============================================================
   SHEETPOST — the only file you edit to go live.
   Everything here is deployment configuration, not code.
   `npm run check` fails while any REQUIRED field is still empty,
   so an unfinished imprint can never reach production.
   ============================================================ */
window.SP_CONFIG = {
  /* --- REQUIRED before launch: legal identity of the operator --------------
     These appear in the footer imprint and in the privacy policy. Leave them
     empty and the site quietly omits the sentence rather than printing a
     placeholder at a visitor. */
  legalName: '',          /* REQUIRED e.g. "Jan Kowalski PR"                  */
  registryNo: '',         /* REQUIRED APR registration number                 */
  taxId: '',              /* REQUIRED PIB                                     */
  address: '',            /* REQUIRED e.g. "Ulica 1, 11000 Beograd"           */
  country: 'Serbia',
  countryEn: 'Serbia',

  /* --- contact ---------------------------------------------------------- */
  email: 'kontakt@sheetpost.app',
  partnerEmail: 'partnerzy@sheetpost.app',

  /* --- waitlist ---------------------------------------------------------
     Empty = the signup is stored in localStorage only (useful for demos).
     Set a Formspree / Netlify Forms / Polar endpoint to actually collect
     addresses, and add its host to connect-src in `_headers`. */
  formEndpoint: ''
};
