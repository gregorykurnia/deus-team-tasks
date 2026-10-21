// The first script in the page, before the app is ready (root layout). It marks a page opened again in the same visit
// (with no connection every screen change is a full page load), so the launch screen shows only when the app opens,
// and it keeps the browser's install offer, which can come before the app is ready and is sent only once
// (installPrompt.ts picks it up).
export const EARLY_SCRIPT = `(function(){try{var k="deus-opened";if(sessionStorage.getItem(k))document.documentElement.setAttribute("data-warm","");sessionStorage.setItem(k,"1")}catch(e){}window.addEventListener("beforeinstallprompt",function(e){e.preventDefault();window.__deusInstallOffer=e})})()`;
