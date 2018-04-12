// Generate sphinx docid for clubs
//

'use strict';


module.exports = function search_docid_club(N, topic_hid) {
  return N.shared.content_type.CLUB_SOLE * Math.pow(2, 47) + // 5 bit
         topic_hid; // 47 bit
};
