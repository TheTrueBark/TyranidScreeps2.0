const tasks = [];
const highPriorityTasks = [];

const scheduler = {
    addTask(name, interval, taskFunction, highPriority = false) {
        const task = {
            name: name,
            interval: interval,
            taskFunction: taskFunction,
            nextRun: Game.time + interval,
            highPriority: highPriority,
            executed: false // Track if the task has been executed at least once
        };

        if (highPriority) {
            highPriorityTasks.push(task);
        } else {
            tasks.push(task);
        }
    },
    run() {
        // Run high priority tasks that haven't been executed yet
        for (const task of highPriorityTasks) {
            if (!task.executed) {
                task.taskFunction();
                task.executed = true;
                task.nextRun = Game.time + task.interval;
            }
        }

        // Run scheduled tasks
        for (const task of tasks) {
            if (Game.time >= task.nextRun) {
                task.taskFunction();
                task.executed = true;
                task.nextRun = Game.time + task.interval;
            }
        }
    },
    runTaskNow(name) {
        const task = tasks.find(t => t.name === name) || highPriorityTasks.find(t => t.name === name);
        if (task) {
            task.taskFunction();
            task.nextRun = Game.time + task.interval;
        }
    },
    requestTaskUpdate(name) {
        const task = tasks.find(t => t.name === name) || highPriorityTasks.find(t => t.name === name);
        if (task) {
            task.nextRun = Game.time; // Set the task to run on the next tick
        }
    }
};

module.exports = scheduler;