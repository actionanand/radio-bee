// Synchronous cached preference before styles/Angular. Preferences is reconciled at startup.
(function () {
  var mode = 'automatic';
  try {
    var saved = localStorage.getItem('radiobee.theme.v1');
    if (saved === 'light' || saved === 'dark') mode = saved;
  } catch (_) {}
  var dark = mode === 'dark' || (mode === 'automatic' && matchMedia('(prefers-color-scheme: dark)').matches);
  document.documentElement.classList.toggle('ion-palette-dark', dark);
  document.documentElement.style.colorScheme = dark ? 'dark' : 'light';
})();
