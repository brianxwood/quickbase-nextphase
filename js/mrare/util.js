//
//
// Util
//
// Medium Rare utility functions
// v1.0.0

import jQuery from 'jquery';

const mrUtil = (($) => {
  // Activate tooltips
  $('[data-toggle="tooltip"]').tooltip();

  // Activate toasts
  $('.toast').toast();

  const Util = {

    activateIframeSrc(iframe) {
      const $iframe = $(iframe);
      if ($iframe.attr('data-src')) {
        $iframe.attr('src', $iframe.attr('data-src'));
      }
    },

    idleIframeSrc(iframe) {
      const $iframe = $(iframe);
      $iframe.attr('data-src', $iframe.attr('src')).attr('src', '');
    },
  };

  return Util;
})(jQuery);

export default mrUtil;
