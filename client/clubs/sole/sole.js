'use strict';


const _ = require('lodash');


// Club state
//
// - hid:                current club hid
// - first_offset:       offset of the first topic in the DOM
// - current_offset:     offset of the current topic (first in the viewport)
// - reached_start:      true if no more pages exist above first loaded one
// - reached_end:        true if no more pages exist below last loaded one
// - prev_loading_start: time when current xhr request for the previous page is started
// - next_loading_start: time when current xhr request for the next page is started
// - top_marker:         last post id of the topmost topic (for prefetch)
// - bottom_marker:      last post id of the bottom topic (for prefetch)
// - selected_topics:    array of selected topics in current topic
//
let pageState = {};

let $window = $(window);

// offset between navbar and the first topic
const TOP_OFFSET = 32;

// whenever there are more than 600 topics, cut off-screen topics down to 400
const CUT_ITEMS_MAX = 600;
const CUT_ITEMS_MIN = 400;

const navbarHeight = parseInt($('body').css('margin-top'), 10) + parseInt($('body').css('padding-top'), 10);


/////////////////////////////////////////////////////////////////////
// init on page load
//
N.wire.on('navigate.done:' + module.apiPath, function page_setup(data) {
  let pagination     = N.runtime.page_data.pagination,
      last_topic_hid = $('.clubs-sole-root').data('last-topic-hid');

  pageState.hid                = data.params.club_hid;
  pageState.first_offset       = pagination.chunk_offset;
  pageState.current_offset     = -1;
  pageState.topic_count        = pagination.total;
  pageState.reached_start      = pageState.first_offset === 0;
  pageState.reached_end        = last_topic_hid === $('.clubs-topicline:last').data('topic-hid');
  pageState.prev_loading_start = 0;
  pageState.next_loading_start = 0;
  pageState.top_marker         = $('.clubs-sole-root').data('top-marker');
  pageState.bottom_marker      = $('.clubs-sole-root').data('bottom-marker');
  pageState.selected_topics    = [];

  // disable automatic scroll to an anchor in the navigator
  data.no_scroll = true;

  // If user returns from a topic page back to club, highlight a linked topic
  //
  // TODO: check if we can parse anchor more gently
  //
  let el;

  if (data.state && typeof data.state.hid !== 'undefined' && typeof data.state.offset !== 'undefined') {
    el = $('#topic' + data.state.hid);

    if (el.length) {
      $window.scrollTop(el.offset().top - $('.navbar').height() - TOP_OFFSET + data.state.offset);
      return;
    }

  } else if (data.params.topic_hid) {
    el = $('#topic' + data.params.topic_hid);

    if (el.length) {
      $window.scrollTop(el.offset().top - $('.navbar').height() - TOP_OFFSET);
      el.addClass('clubs-topicline__m-highlight');
      return;
    }
  }


  // If we're on the first page, scroll to the top;
  // otherwise, scroll to the first topic on that page
  //
  if (pagination.chunk_offset > 1 && $('.clubs-topiclist').length) {
    $window.scrollTop($('.clubs-topiclist').offset().top - $('.navbar').height());

  } else {
    $window.scrollTop(0);
  }
});


/////////////////////////////////////////////////////////////////////
// Update club state
//
function updateClubState() {
  // Need to re-render reply button and dropdown here
  $('.clubs-sole__toolbar-controls')
    .replaceWith(N.runtime.render(module.apiPath + '.blocks.toolbar_controls', {
      club:           N.runtime.page_data.club,
      settings:       N.runtime.page_data.settings,
      is_club_owner:  N.runtime.page_data.is_club_owner,
      is_club_member: N.runtime.page_data.is_club_member,
      subscription:   N.runtime.page_data.subscription,
      selected_cnt:   pageState.selected_topics.length
    }));
}


N.wire.once('navigate.done:' + module.apiPath, function page_once() {

  // Club subscription handler
  //
  N.wire.on(module.apiPath + ':subscription', function topic_subscription(data) {
    let hid = data.$this.data('club-hid');
    let params = { subscription: data.$this.data('club-subscription') };

    return Promise.resolve()
      .then(() => N.wire.emit('clubs.sole.subscription', params))
      .then(() => N.io.rpc('clubs.sole.subscribe', { club_hid: hid, type: params.subscription }))
      .then(() => {
        N.runtime.page_data.subscription = params.subscription;
      })
      .then(updateClubState);
  });


  // Join the club
  //
  N.wire.on(module.apiPath + ':join', function join(data) {
    let hid = data.$this.data('club-hid');

    return Promise.resolve()
      .then(() => N.io.rpc('clubs.sole.join', { club_hid: hid }))
      .then(res => {
        if (res.request_pending) {
          return N.wire.emit('notify.info', t('result_pending'));
        }

        return N.wire.emit('notify.info', t('result_success'))
                  .then(() => N.wire.emit('navigate.reload'));
      });
  });


  // Leave the club
  //
  N.wire.on(module.apiPath + ':leave', function leave(data) {
    let hid = data.$this.data('club-hid');

    return Promise.resolve()
      .then(() => N.io.rpc('clubs.sole.leave', { club_hid: hid }))
      .then(() => N.wire.emit('navigate.reload'));
  });


  // Click topic create
  //
  N.wire.on(module.apiPath + ':create', function reply(data) {
    return N.wire.emit('clubs.topic.create:begin', {
      club_hid: data.$this.data('club-hid'),
      club_title: data.$this.data('club-title')
    });
  });


  // Click report button
  //
  N.wire.on(module.apiPath + ':report', function report(data) {
    let params = { placeholder: t('abuse_report_placeholder'), messages: t('@clubs.abuse_report.club_sole.messages') };
    let clubId = data.$this.data('club-id');

    return Promise.resolve()
      .then(() => N.wire.emit('common.blocks.abuse_report_dlg', params))
      .then(() => N.io.rpc('clubs.sole.abuse_report', { club_id: clubId, message: params.message }))
      .then(() => N.wire.emit('notify.info', t('abuse_reported')));
  });


  // Click mark all read
  //
  N.wire.on(module.apiPath + ':mark_read', function reply(data) {
    return N.io.rpc('clubs.sole.mark_read', { hid: data.$this.data('club-hid') })
      .then(() => {
        $('.clubs-topicline.clubs-topicline__m-new, .clubs-topicline.clubs-topicline__m-unread')
          .removeClass('clubs-topicline__m-new')
          .removeClass('clubs-topicline__m-unread');
      });
  });


  // User presses "home" button
  //
  N.wire.on(module.apiPath + ':nav_to_start', function navigate_to_start() {
    // if the first topic is already loaded, scroll to the top
    if (pageState.reached_start) {
      $window.scrollTop(0);
      return;
    }

    return N.wire.emit('navigate.to', {
      apiPath: 'clubs.sole',
      params: {
        club_hid: pageState.hid
      }
    });
  });


  // User presses "end" button
  //
  N.wire.on(module.apiPath + ':nav_to_end', function navigate_to_end() {
    if (pageState.reached_end) {
      $window.scrollTop($(document).height());
      return;
    }

    return N.wire.emit('navigate.to', {
      apiPath: 'clubs.sole',
      params: {
        club_hid:  pageState.hid,
        topic_hid: $('.clubs-sole-root').data('last-topic-hid')
      }
    });
  });
});


/////////////////////////////////////////////////////////////////////
// When user scrolls the page:
//
//  1. update progress bar
//  2. show/hide navbar
//
let progressScrollHandler = null;

N.wire.on('navigate.done:' + module.apiPath, function progress_updater_init() {
  if ($('.clubs-topiclist').length === 0) { return; }

  progressScrollHandler = _.debounce(function update_progress_on_scroll() {
    // If we scroll below page title, show the secondary navbar
    //
    let title = document.getElementsByClassName('page-head');

    if (title.length && title[0].getBoundingClientRect().bottom > navbarHeight) {
      $('.navbar').removeClass('navbar__m-secondary');
    } else {
      $('.navbar').addClass('navbar__m-secondary');
    }

    //
    // Update progress bar
    //
    let topics         = document.getElementsByClassName('clubs-topicline'),
        topicThreshold = navbarHeight + TOP_OFFSET,
        offset,
        currentIdx;

    // Get offset of the first topic in the viewport
    //
    currentIdx = _.sortedIndexBy(topics, null, topic => {
      if (!topic) { return topicThreshold; }
      return topic.getBoundingClientRect().top;
    }) - 1;

    offset = currentIdx + pageState.first_offset;

    N.wire.emit('common.blocks.navbar.blocks.page_progress:update', {
      current: offset + 1 // `+1` because offset is zero based
    }).catch(err => {
      N.wire.emit('error', err);
    });
  }, 100, { maxWait: 100 });

  // avoid executing it on first tick because of initial scrollTop()
  setTimeout(function () {
    $window.on('scroll', progressScrollHandler);
  });


  // execute it once on page load
  progressScrollHandler();
});

N.wire.on('navigate.exit:' + module.apiPath, function progress_updater_teardown() {
  if (!progressScrollHandler) return;
  progressScrollHandler.cancel();
  $window.off('scroll', progressScrollHandler);
  progressScrollHandler = null;
});


/////////////////////////////////////////////////////////////////////
// Change URL when user scrolls the page
//
// Use a separate debouncer that only fires when user stops scrolling,
// so it's executed a lot less frequently.
//
// The reason is that `history.replaceState` is very slow in FF
// on large pages: https://bugzilla.mozilla.org/show_bug.cgi?id=1250972
//
let locationScrollHandler = null;

N.wire.on('navigate.done:' + module.apiPath, function location_updater_init() {
  if ($('.clubs-topiclist').length === 0) { return; }

  locationScrollHandler = _.debounce(function update_location_on_scroll() {
    let topics         = document.getElementsByClassName('clubs-topicline'),
        topicThreshold = navbarHeight + TOP_OFFSET,
        offset         = 0,
        currentIdx;

    // Get offset of the first topic in the viewport
    //
    currentIdx = _.sortedIndexBy(topics, null, topic => {
      if (!topic) { return topicThreshold; }
      return topic.getBoundingClientRect().top;
    }) - 1;

    let href = null;
    let state = null;

    offset = currentIdx + pageState.first_offset;

    if (currentIdx >= 0 && topics.length) {
      state = {
        hid:    $(topics[currentIdx]).data('topic-hid'),
        offset: topicThreshold - topics[currentIdx].getBoundingClientRect().top
      };
    }

    // save current offset, and only update url if offset is different,
    // it protects url like /f1/topic23/page4 from being overwritten instantly
    if (pageState.current_offset !== offset) {
      /* eslint-disable no-undefined */
      href = N.router.linkTo('clubs.sole', {
        club_hid:  pageState.hid,
        topic_hid: currentIdx >= 0 ? $(topics[currentIdx]).data('topic-hid') : undefined
      });

      if (pageState.current_offset <= 0 && offset > 0) {
        $('head').append($('<meta name="robots" content="noindex,follow">'));
      } else if (pageState.current_offset > 0 && offset <= 0) {
        $('meta[name="robots"]').remove();
      }

      pageState.current_offset = offset;
    }

    N.wire.emit('navigate.replace', { href, state });
  }, 500);

  // avoid executing it on first tick because of initial scrollTop()
  setTimeout(function () {
    $window.on('scroll', locationScrollHandler);
  }, 1);
});

N.wire.on('navigate.exit:' + module.apiPath, function location_updater_teardown() {
  if (!locationScrollHandler) return;
  locationScrollHandler.cancel();
  $window.off('scroll', locationScrollHandler);
  locationScrollHandler = null;
});


///////////////////////////////////////////////////////////////////////////////
// Many topics selection
//


const bag = require('bagjs')({ prefix: 'nodeca' });
let selected_topics_key;
// Flag shift key pressed
let shift_key_pressed = false;
// DOM element of first selected post (for many check)
let $many_select_start;


// Handle shift keyup event
//
function key_up(event) {
  // If shift still pressed
  if (event.shiftKey) return;

  shift_key_pressed = false;
}


// Handle shift keydown event
//
function key_down(event) {
  if (event.shiftKey) {
    shift_key_pressed = true;
  }
}


// Save selected topics + debounced
//
function save_selected_topics_immediate() {
  if (pageState.selected_topics.length) {
    // Expire after 1 day
    bag.set(selected_topics_key, pageState.selected_topics, 60 * 60 * 24).catch(() => {});
  } else {
    bag.remove(selected_topics_key).catch(() => {});
  }
}
const save_selected_topics = _.debounce(save_selected_topics_immediate, 500);


// Show/hide loading placeholders when new topics are fetched,
// adjust scroll when adding/removing top placeholder
//
function reset_loading_placeholders() {
  let prev = $('.clubs-sole__loading-prev');
  let next = $('.clubs-sole__loading-next');

  // if topmost topic is loaded, hide top placeholder
  if (pageState.reached_start) {
    if (!prev.hasClass('d-none')) {
      $window.scrollTop($window.scrollTop() - prev.outerHeight(true));
    }

    prev.addClass('d-none');
  } else {
    if (prev.hasClass('d-none')) {
      $window.scrollTop($window.scrollTop() + prev.outerHeight(true));
    }

    prev.removeClass('d-none');
  }

  // if last topic is loaded, hide bottom placeholder
  if (pageState.reached_end) {
    next.addClass('d-none');
  } else {
    next.removeClass('d-none');
  }
}


// Load previously selected topics
//
N.wire.on('navigate.done:' + module.apiPath, function clubs_load_previously_selected_topics() {
  selected_topics_key = `clubs_selected_topics_${N.runtime.user_hid}_${pageState.hid}`;

  $(document)
    .on('keyup', key_up)
    .on('keydown', key_down);

  // Don't need wait here
  bag.get(selected_topics_key)
    .then(hids => {
      hids = hids || [];
      pageState.selected_topics = hids;
      pageState.selected_topics.forEach(topicHid => {
        $(`#topic${topicHid}`)
          .addClass('clubs-topicline__m-selected')
          .find('.clubs-topicline__select-cb')
          .prop('checked', true);
      });

      return hids.length ? updateClubState() : null;
    })
    .catch(() => {}); // Suppress storage errors
});


// Init handlers
//
N.wire.once('navigate.done:' + module.apiPath, function clubs_topics_selection_init() {

  // Update array of selected topics on selection change
  //
  N.wire.on(module.apiPath + ':topic_check', function club_topic_select(data) {
    let topicHid = data.$this.data('topic-hid');

    if (data.$this.is(':checked') && pageState.selected_topics.indexOf(topicHid) === -1) {
      // Select
      //
      if ($many_select_start) {

        // If many select started
        //
        let $topic = data.$this.closest('.clubs-topicline');
        let $start = $many_select_start;
        let topicsBetween;

        $many_select_start = null;

        // If current after `$many_select_start`
        if ($start.index() < $topic.index()) {
          // Get topics between start and current
          topicsBetween = $start.nextUntil($topic, '.clubs-topicline');
        } else {
          // Between current and start (in reverse order)
          topicsBetween = $topic.nextUntil($start, '.clubs-topicline');
        }

        topicsBetween.each(function () {
          let hid = $(this).data('topic-hid');

          if (pageState.selected_topics.indexOf(hid) === -1) {
            pageState.selected_topics.push(hid);
          }

          $(this)
            .addClass('clubs-topicline__m-selected')
            .find('.clubs-topicline__select-cb').prop('checked', true);
        });

        pageState.selected_topics.push(topicHid);
        $topic.addClass('clubs-topicline__m-selected');


      } else if (shift_key_pressed) {
        // If many select not started and shift key pressed
        //
        let $topic = data.$this.closest('.clubs-topicline');

        $many_select_start = $topic;
        $topic.addClass('clubs-topicline__m-selected');
        pageState.selected_topics.push(topicHid);

        N.wire.emit('notify.info', t('msg_multiselect'));


      } else {
        // No many select
        //
        data.$this.closest('.clubs-topicline').addClass('clubs-topicline__m-selected');
        pageState.selected_topics.push(topicHid);
      }


    } else if (!data.$this.is(':checked') && pageState.selected_topics.indexOf(topicHid) !== -1) {
      // Unselect
      //
      data.$this.closest('.clubs-topicline').removeClass('clubs-topicline__m-selected');
      pageState.selected_topics = _.without(pageState.selected_topics, topicHid);
    }

    save_selected_topics();
    return updateClubState();
  });


  // Unselect all topics
  //
  N.wire.on(module.apiPath + ':topics_unselect', function club_topic_unselect() {
    pageState.selected_topics = [];

    $('.clubs-topicline__select-cb:checked').each(function () {
      $(this)
        .prop('checked', false)
        .closest('.clubs-topicline')
        .removeClass('clubs-topicline__m-selected');
    });

    save_selected_topics();
    return updateClubState();
  });


  // Delete topics
  //
  N.wire.on(module.apiPath + ':delete_many', function club_topic_delete_many() {
    let params = {
      canDeleteHard: N.runtime.page_data.settings.clubs_mod_can_hard_delete_topics
    };

    return Promise.resolve()
      .then(() => N.wire.emit('clubs.sole.topic_delete_many_dlg', params))
      .then(() => {
        let request = {
          club_hid: pageState.hid,
          topics_hids: pageState.selected_topics,
          method: params.method
        };

        if (params.reason) request.reason = params.reason;

        return N.io.rpc('clubs.sole.topic.destroy_many', request);
      })
      .then(() => {
        pageState.selected_topics = [];
        save_selected_topics_immediate();

        return N.wire.emit('notify.info', t('many_topics_deleted'));
      })
      .then(() => N.wire.emit('navigate.reload'));
  });


  // Undelete topics
  //
  N.wire.on(module.apiPath + ':undelete_many', function club_topic_undelete_many() {
    let request = {
      club_hid:    pageState.hid,
      topics_hids: pageState.selected_topics
    };

    return Promise.resolve()
      .then(() => N.wire.emit('common.blocks.confirm', t('many_undelete_confirm')))
      .then(() => N.io.rpc('clubs.sole.topic.undelete_many', request))
      .then(() => {
        pageState.selected_topics = [];
        save_selected_topics_immediate();
      })
      .then(() => N.wire.emit('notify.info', t('many_topics_undeleted')))
      .then(() => N.wire.emit('navigate.reload'));
  });


  // Close topics
  //
  N.wire.on(module.apiPath + ':close_many', function club_topic_close_many() {
    let request = {
      club_hid: pageState.hid,
      topics_hids: pageState.selected_topics
    };

    return Promise.resolve()
      .then(() => N.wire.emit('common.blocks.confirm', t('many_close_confirm')))
      .then(() => N.io.rpc('clubs.sole.topic.close_many', request))
      .then(() => {
        pageState.selected_topics = [];
        save_selected_topics_immediate();
      })
      .then(() => N.wire.emit('notify.info', t('many_topics_closed')))
      .then(() => N.wire.emit('navigate.reload'));
  });


  // Open topics
  //
  N.wire.on(module.apiPath + ':open_many', function club_topic_open_many() {
    let request = {
      club_hid: pageState.hid,
      topics_hids: pageState.selected_topics
    };

    return Promise.resolve()
      .then(() => N.wire.emit('common.blocks.confirm', t('many_open_confirm')))
      .then(() => N.io.rpc('clubs.sole.topic.open_many', request))
      .then(() => {
        pageState.selected_topics = [];
        save_selected_topics_immediate();
      })
      .then(() => N.wire.emit('notify.info', t('many_topics_opened')))
      .then(() => N.wire.emit('navigate.reload'));
  });


  ///////////////////////////////////////////////////////////////////////////
  // Whenever we are close to beginning/end of topic list, check if we can
  // load more pages from the server
  //

  // an amount of topics we try to load when user scrolls to the end of the page
  const LOAD_TOPICS_COUNT = N.runtime.page_data.pagination.per_page;

  // A delay after failed xhr request (delay between successful requests
  // is set with affix `throttle` argument)
  //
  // For example, suppose user continuously scrolls. If server is up, each
  // subsequent request will be sent each 100 ms. If server goes down, the
  // interval between request initiations goes up to 2000 ms.
  //
  const LOAD_AFTER_ERROR = 2000;

  N.wire.on(module.apiPath + ':load_prev', function load_prev_page() {
    if (pageState.reached_start) return;

    let last_post_id = pageState.top_marker;

    // No topics on the page
    if (!last_post_id) return;

    let now = Date.now();

    // `prev_loading_start` is the last request start time, which is reset to 0 on success
    //
    // Thus, successful requests can restart immediately, but failed ones
    // will have to wait `LOAD_AFTER_ERROR` ms.
    //
    if (Math.abs(pageState.prev_loading_start - now) < LOAD_AFTER_ERROR) return;

    pageState.prev_loading_start = now;

    N.io.rpc('clubs.sole.list.by_range', {
      club_hid:      pageState.hid,
      last_post_id,
      before:        LOAD_TOPICS_COUNT,
      after:         0
    }).then(function (res) {
      if (!res.topics) return;

      if (res.topics.length !== LOAD_TOPICS_COUNT) {
        pageState.reached_start = true;
        $('.clubs-sole-root').addClass('clubs-sole-root__m-first-page');
        reset_loading_placeholders();
      }

      if (res.topics.length === 0) return;

      pageState.top_marker = res.topics[0].cache.last_post;

      // remove duplicate topics
      res.topics.forEach(topic => $(`#topic${topic.hid}`).remove());

      let old_height = $('.clubs-topiclist').height();

      // render & inject topics list
      let $result = $(N.runtime.render('clubs.blocks.topics_list', res));
      $('.clubs-topiclist').prepend($result);

      // update scroll so it would point at the same spot as before
      $window.scrollTop($window.scrollTop() + $('.clubs-topiclist').height() - old_height);

      pageState.first_offset  = res.pagination.chunk_offset;
      pageState.topic_count   = res.pagination.total;

      // Update selection state
      _.intersection(pageState.selected_topics, _.map(res.topics, 'hid')).forEach(topicHid => {
        $(`#topic${topicHid}`)
          .addClass('clubs-topicline__m-selected')
          .find('.clubs-topicline__select-cb')
          .prop('checked', true);
      });

      // update prev/next metadata
      $('link[rel="prev"]').remove();

      if (res.head.prev) {
        let link = $('<link rel="prev">');

        link.attr('href', res.head.prev);
        $('head').append(link);
      }

      //
      // Limit total amount of posts in DOM
      //
      let topics    = document.getElementsByClassName('clubs-topicline');
      let cut_count = topics.length - CUT_ITEMS_MIN;

      if (cut_count > CUT_ITEMS_MAX - CUT_ITEMS_MIN) {
        let topic = topics[topics.length - cut_count - 1];

        // This condition is a safeguard to prevent infinite loop,
        // which happens if we remove a post on the screen and trigger
        // prefetch in the opposite direction (test it with
        // CUT_ITEMS_MAX=10, CUT_ITEMS_MIN=0)
        if (topic.getBoundingClientRect().top > $window.height() + 600) {
          $(topic).nextAll().remove();

          // Update range for the next time we'll be doing prefetch
          pageState.bottom_marker = $('.clubs-topicline:last').data('last-post');

          pageState.reached_end = false;
          reset_loading_placeholders();
        }
      }

      // reset lock
      pageState.prev_loading_start = 0;

      return N.wire.emit('common.blocks.navbar.blocks.page_progress:update', {
        max: pageState.topic_count
      });
    }).catch(err => {
      N.wire.emit('error', err);
    });
  });


  N.wire.on(module.apiPath + ':load_next', function load_next_page() {
    if (pageState.reached_end) return;

    let last_post_id = pageState.bottom_marker;

    // No topics on the page
    if (!last_post_id) return;

    let now = Date.now();

    // `next_loading_start` is the last request start time, which is reset to 0 on success
    //
    // Thus, successful requests can restart immediately, but failed ones
    // will have to wait `LOAD_AFTER_ERROR` ms.
    //
    if (Math.abs(pageState.next_loading_start - now) < LOAD_AFTER_ERROR) return;

    pageState.next_loading_start = now;

    N.io.rpc('clubs.sole.list.by_range', {
      club_hid:      pageState.hid,
      last_post_id,
      before:        0,
      after:         LOAD_TOPICS_COUNT
    }).then(function (res) {
      if (!res.topics) return;

      if (res.topics.length !== LOAD_TOPICS_COUNT) {
        pageState.reached_end = true;
        reset_loading_placeholders();
      }

      if (res.topics.length === 0) return;

      pageState.bottom_marker = res.topics[res.topics.length - 1].cache.last_post;

      let old_height = $('.clubs-topiclist').height();

      // remove duplicate topics
      let deleted_count = res.topics.filter(topic => {
        let el = $(`#topic${topic.hid}`);

        if (el.length) {
          el.remove();
          return true;
        }
      }).length;

      // update scroll so it would point at the same spot as before
      if (deleted_count > 0) {
        $window.scrollTop($window.scrollTop() + $('.clubs-topiclist').height() - old_height);
      }

      pageState.first_offset = res.pagination.chunk_offset - $('.clubs-topicline').length;
      pageState.topic_count  = res.pagination.total;

      // render & inject topics list
      let $result = $(N.runtime.render('clubs.blocks.topics_list', res));
      $('.clubs-topiclist').append($result);

      // Workaround for FF bug, possibly this one:
      // https://github.com/nodeca/nodeca.core/issues/2
      //
      // When user scrolls down and we insert content to the end
      // of the page, and the page is large enough (~1000 topics
      // or more), next scrollTop() read on 'scroll' event may
      // return invalid (too low) value.
      //
      // Reading scrollTop in the same tick seem to prevent this
      // from happening.
      //
      $window.scrollTop();

      // Update selection state
      _.intersection(pageState.selected_topics, _.map(res.topics, 'hid')).forEach(topicHid => {
        $(`#topic${topicHid}`)
          .addClass('clubs-topicline__m-selected')
          .find('.clubs-topicline__select-cb')
          .prop('checked', true);
      });

      // update next/next metadata
      $('link[rel="next"]').remove();

      if (res.head.next) {
        let link = $('<link rel="next">');

        link.attr('href', res.head.next);
        $('head').append(link);
      }

      //
      // Limit total amount of topics in DOM
      //
      let topics    = document.getElementsByClassName('clubs-topicline');
      let cut_count = topics.length - CUT_ITEMS_MIN;

      if (cut_count > CUT_ITEMS_MAX - CUT_ITEMS_MIN) {
        let topic = topics[cut_count];

        // This condition is a safeguard to prevent infinite loop,
        // which happens if we remove a post on the screen and trigger
        // prefetch in the opposite direction (test it with
        // CUT_ITEMS_MAX=10, CUT_ITEMS_MIN=0)
        if (topic.getBoundingClientRect().bottom < -600) {
          let old_height = $('.clubs-topiclist').height();
          let old_scroll = $window.scrollTop(); // might change on remove()
          let old_length = topics.length;

          $(topic).prevAll().remove();

          // Update range for the next time we'll be doing prefetch
          pageState.top_marker = $('.clubs-topicline:first').data('last-post');

          // update scroll so it would point at the same spot as before
          $window.scrollTop(old_scroll + $('.clubs-topiclist').height() - old_height);
          pageState.first_offset += old_length - document.getElementsByClassName('clubs-topicline').length;

          pageState.reached_start = false;
          reset_loading_placeholders();
          $('.clubs-sole-root').removeClass('clubs-sole-root__m-first-page');
        }
      }

      // reset lock
      pageState.next_loading_start = 0;

      return N.wire.emit('common.blocks.navbar.blocks.page_progress:update', {
        max: pageState.topic_count
      });
    }).catch(err => {
      N.wire.emit('error', err);
    });
  });
});


// Teardown many topics selection
//
N.wire.on('navigate.exit:' + module.apiPath, function club_topic_selection_teardown() {
  $(document)
    .off('keyup', key_up)
    .off('keydown', key_down);
});
