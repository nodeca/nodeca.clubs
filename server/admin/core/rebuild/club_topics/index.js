// Add a widget displaying topic cache rebuild progress
//

'use strict';


module.exports = function (N) {
  N.wire.after('server:admin.core.rebuild', { priority: 46 }, async function rebuild_club_topics_widget(env) {
    let task = await N.queue.getTask('club_topics_rebuild');
    let task_info = {};

    if (task && task.state !== 'finished') {
      task_info = {
        current: task.progress,
        total:   task.total
      };
    }

    env.res.blocks.push({ name: 'club_topics', task_info });
  });
};
