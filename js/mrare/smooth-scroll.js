//
//
// smooth-scroll.js
//
// Initialises the prism code highlighting plugin

import $ from 'jquery';
import SmoothScroll from 'smooth-scroll';

const mrSmoothScroll = new SmoothScroll('a[data-smooth-scroll]', {
  offset: $('body').attr('data-smooth-scroll-offset') || 0,
});

export default mrSmoothScroll;
