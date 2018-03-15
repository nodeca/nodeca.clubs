// Add a widget displaying post rebuild progress
//
'use strict';


module.exports = function (N) {
  N.wire.after('server:admin.core.rebuild', { priority: 45 }, async function rebuild_club_posts_widget(env) {
    let task = await N.queue.getTask('club_posts_rebuild');
    let task_info = {};

    if (task && task.state !== 'finished') {
      task_info = {
        current: task.progress,
        total:   task.total
      };
    }

    env.res.blocks.push({ name: 'club_posts', task_info });
  });
};
