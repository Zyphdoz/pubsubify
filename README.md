Pubsubify makes use of setters to let subscribers know about state updates. One caveat with this is that setters are not triggered when you modify an object or an array that’s already been set. 

```
private task: task = { //.state
    title: '',
    description: '',
};

// this will not trigger the setter
setDescription(description: string) {
    this.task.description = description;
}

// this will trigger the setter
setDescription(description: string) {
    this.task = { ...this.task, description: description };
}

// this will also trigger the setter
setDescription(description: string) {
    this.task.description = description;
    this.task = this.task;
}
```

The same goes for arrays, instead of using array.push() which will not trigger a state update you want to spread the array into a new array and append the new item at the end and then assign that to the original array.
```
private tasks: string[] = []; //.state

// this will not trigger the setter
addTask(task: string) {
    this.tasks.push(task)
}

// this will trigger the setter
addTask(task: string) {
    this.tasks = [...this.tasks[key], task];
}

// this will also trigger the setter
addTask(task: string) {
    this.tasks.push(task);
    this.tasks = this.tasks;
}
```




Code formatters
Be vary of code formatters moving your //.state comments around.

Prettier is known to turn this
```
private task: CalendarTask = { //.state
    title: '',
    description: '',
};
```
into this
```
private task: CalendarTask = { 
    //.state
    title: '',
    description: '',
};
```
in the case of prettier you can solve it with a //prettier-ignore above the line
```
//prettier-ignore
private task: CalendarTask = { //.state
    title: '',
    description: '',
};
```

Order of saving files
You should have a .ts file with a //.state comment and save it before you add a //.state comment to an import statement in a .tsx file. If you don't, pubsubify will add code that tries to call a function that doesn't exist yet. That will cause syntax errors if your project reloads on save.