// Two different links, used for two different things:

// 1. REVIEW_URL — the club's Google Business (Maps) listing, opened by the
//    Profile screen's "Rate us on Google" row so members can review the
//    turf. ONLY used for that.
export const REVIEW_URL =
  'https://www.google.com/search?sca_esv=ec03e63a45fc7ff0&sxsrf=APpeQnsb3DeRtAx1nAczCoNcO1ymt3lk-A:1789794566478&q=thrill+mill&si=APenkKm7iecQ4G6P-TsbSMFKIQtv3EFIqRAFw-i8uEbk55Z-_wqHckuXyhyzYlky9nQKL_KoUiLNHX1Ner7M7v6IWO4bx74w7UqEMeZSnKjLnPhAiIu_Qh8pTemaYoNeDgUnT5pKi1-t8EX6dVsdJY-nsND_1x6bLA%3D%3D&sa=X&ved=2ahUKEwix9euq8PmWAxVukeEIHYZ1M38QrrQLegQIMRAB&biw=1536&bih=695&dpr=1.25&safe=active&ssui=on#lrd=0x3ba8f73d5201c06d:0x7480bc511a2898e3,3,,,,';

// 2. APP_SHARE_URL — the link put into "invite your team" messages. A Play
//    Store listing URL is fixed by the app's package name, so it can be set
//    now: until the app is published it shows "not found", and it starts
//    working on its own the moment the listing goes live — nothing to change
//    in the app. (Until then, for a private test round, temporarily swap in
//    the EAS build's install link.)
export const APP_SHARE_URL = 'https://play.google.com/store/apps/details?id=com.thrillmillclub.app';
