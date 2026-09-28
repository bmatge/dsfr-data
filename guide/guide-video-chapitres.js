/**
 * Sommaire cliquable d'une vidéo chapitrée du guide.
 *
 * Balisage attendu : un <video data-chapitres> et, dans la page, des liens [data-debut="<secondes>"] (sommaire DSFR).
 * - clic sur un lien : la vidéo se positionne au début du chapitre et démarre ;
 * - pendant la lecture : le chapitre en cours porte aria-current="step" ;
 * - arrivée avec une ancre (#<id-du-chapitre>) : la vidéo est positionnée sur ce chapitre (sans lecture automatique).
 */
(function () {
  'use strict';

  function init() {
    var video = document.querySelector('video[data-chapitres]');
    if (!video) return;
    var liens = Array.prototype.slice.call(document.querySelectorAll('a[data-debut]'));
    if (!liens.length) return;

    function debut(lien) {
      return parseFloat(lien.getAttribute('data-debut')) || 0;
    }

    function positionner(t, lire) {
      var aller = function () {
        video.currentTime = t + 0.05;
        if (lire) {
          var p = video.play();
          if (p && p.catch) p.catch(function () {});
        }
      };
      if (video.readyState >= 1) aller();
      else {
        video.preload = 'metadata';
        video.addEventListener('loadedmetadata', aller, { once: true });
        video.load();
      }
    }

    liens.forEach(function (lien) {
      lien.addEventListener('click', function (e) {
        e.preventDefault();
        var id = (lien.getAttribute('href') || '').replace('#', '');
        if (id && history.replaceState) history.replaceState(null, '', '#' + id);
        positionner(debut(lien), true);
        video.scrollIntoView({ behavior: 'smooth', block: 'center' });
        video.focus({ preventScroll: true });
      });
    });

    video.addEventListener('timeupdate', function () {
      var t = video.currentTime;
      var actif = null;
      liens.forEach(function (lien) {
        if (debut(lien) <= t + 0.1) actif = lien;
      });
      liens.forEach(function (lien) {
        if (lien === actif) lien.setAttribute('aria-current', 'step');
        else lien.removeAttribute('aria-current');
      });
    });

    var ancre = location.hash.replace('#', '');
    if (ancre) {
      var cible = liens.filter(function (l) {
        return l.getAttribute('href') === '#' + ancre;
      })[0];
      if (cible) positionner(debut(cible), false);
    }
  }

  if (document.readyState === 'loading') document.addEventListener('DOMContentLoaded', init);
  else init();
})();
