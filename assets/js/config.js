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
     placeholder at a visitor.
     Copy them from the APR registration document, not from memory. `npm run
     check` validates the shape of each one, so a transposed digit, a PIB
     pasted into the registry field or a leftover placeholder fails the build
     instead of going live in the footer of a site that sells regulatory
     compliance.

       legalName    exactly as registered, including the form,
                    e.g. "Sheetpost d.o.o. Beograd" or "Marko Markovic PR"
       entityForm   'preduzetnik' for a sole proprietor, 'doo' for a d.o.o.
                    It decides the wording of the imprint sentence, and
                    calling a company a sole proprietor in a public imprint
                    misstates the operator's legal form.
       registryNo   maticni broj: exactly 8 digits
       taxId        PIB: exactly 9 digits
       address      street, number, postcode, city
  */
  legalName: '',             /* REQUIRED exactly as registered at the APR     */
  entityForm: 'preduzetnik', /* 'preduzetnik' | 'doo'                         */
  registryNo: '',            /* REQUIRED maticni broj, 8 digits               */
  taxId: '',                 /* REQUIRED PIB, 9 digits                        */
  address: '',               /* REQUIRED "Knez Mihailova 1, 11000 Beograd"    */
  country: 'Serbia',
  countryEn: 'Serbia',

  /* --- contact ---------------------------------------------------------- */
  email: 'kontakt@sheetpost.app',
  partnerEmail: 'partnerzy@sheetpost.app',

  /* --- waitlist ---------------------------------------------------------
     Empty = the signup is stored in localStorage only (useful for demos).
     Set a Formspree / Netlify Forms / Polar endpoint to actually collect
     addresses, and add its host to connect-src in `_headers`. */
  formEndpoint: '',

  /* --- checkout -----------------------------------------------------------
     Hosted checkout links, one per paid plan. Paste the URL your gateway
     gives you and that plan's button starts selling; leave a URL empty and
     that button keeps the pre-launch behaviour it has in the markup (it goes
     to the waitlist). Nothing else has to change: these are ordinary links,
     so no SDK, no inline script, and no change to the Content-Security-Policy
     in `_headers`. Read the "Taking payments" section of HANDOFF.md before
     you fill this in.

       provider    free text, for your own records. It does not switch code
                   paths: any gateway that issues a hosted checkout URL works.
       currencies  the currencies the gateway can actually BILL in, lowercase.
                   The price toggle offers pln, eur and ron; if a reader picks
                   one that is not on this list, the pricing section says which
                   currency they will be charged in instead of quietly
                   charging them something else. Empty = no note is shown.
       links       one hosted checkout URL per paid plan. Must be https.
  */
  checkout: {
    provider: '',                    /* e.g. "paddle" or "polar"             */
    currencies: [],                  /* e.g. ['eur', 'pln']                  */
    links: {
      solo: '',                      /* plan B, the founder price            */
      business: '',                  /* plan C                               */
      accountant: ''                 /* plan D                               */
    }
  }
};
