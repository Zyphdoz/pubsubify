# pubsubify

Pubsubify is a Node.js script that provides the worlds simplest (to my knowledge) alternative to state management in React.

## How it works

Write your state as a singleton class

```ts
class Counter {

    private value = 0; //.state
    
    increment() {
        this.value++;
    }

    getValue() {
        return this.value;
    }
}

export const counter = new Counter();
```

Use it like this

```tsx
import { counter } from "../services/counter" //.state

function Counter() {
    
    return (
      <>
       {counter.getValue()} 
       <button onClick={() => counter.increment()}></button>
      </>
    )
  }

export default Counter
```
You can import counter in any component and it will share the same state.
If you know anything about React, you would think that the above should not work because the component will not rerender when the state updates.

## The //.state comment
`//.state` has a special meaning in pubsubify. It's what makes the above code work.
When you run pubsubify, it creates a slightly modified copy of the directory that it is run from. Whenever it encounters `//.state` in a .ts or .tsx file, it injects some extra code.

The example above will get turned into this:

```ts
class Counter {
    private subscribers = [];

    subscribe(fn) {
        this.subscribers.push(fn);
    }

    unsubscribe(fn) {
        this.subscribers.splice(this.subscribers.indexOf(fn), 1);
    }

    private notifySubscribers() {
        this.subscribers.forEach(fn => {
            fn();
        })
    }

    private _value = 0;

    get value() {
        return this._value;
    }

    set value(val: number) {
        this._value = val;
        this.notifySubscribers();
    }
    
    increment() {
        this.value++;
    }

    getValue() {
        return this.value;
    }
    
}

export const counter = new Counter();
```

```tsx
import { useEffect, useState } from "react"
import { counter } from "../services/counter"

function Counter() {
    const [someNumberToForceRerender, setSomeNumberToForceRerender] = useState<number>(0)

    useEffect(() => {
      counter.subscribe(reRender)  

      return () => counter.unsubscribe(reRender)
    }, [])

    function reRender() {
        setSomeNumberToForceRerender(prevNumber => prevNumber + 1)
    }

    return (
      <>
       {counter.getValue()} 
       <button onClick={() => counter.increment()}></button>
      </>
    )
  }
  
export default Counter
```

This will make the component rerender when the state updates. Pubsubify basically gives you a shorthand way to implement the pubsub pattern and avoid cluttering your files with pubsub code. You write `//.state` after a member in a class to indicate that you want to publish an event when that variable changes. You write `//.state` after an import statement in a component to indicte that you want the component to subscribe to events from that class and rerender whenever a member of that class marked with `//.state` changes.

## Usage
Place pubsubify.js in the root of your project.

Install dev dependencies
```
npm install --save-dev chokidar fs-extra
```

Run pubsubify
```
node pubsubify.js
```

pubsubify will now create a copy of your project and start watching for changes.
The original folder is where you read and write your code and the copy is where you want to run your dev and build commands from.

> [!NOTE]  
> pubsubify does not watch node_modules. You will need to rerun pubsubify for changes in node_modules to be copied over.

> [!TIP]
> If you want to simplify the workflow and avoid the whole run multiple commands from different directories thing, you can install [concurrently](https://www.npmjs.com/package/concurrently) and add the following line to the scripts section in your package.json (don't blindly copypaste this, read what it does and adjust to your needs)
> ```
> "pubsubify": "concurrently \"node pubsubify.js\" \"cd ../replace this with path to your pubsubify output && npm run dev\""
> ```



## Saving files
When saving files you should save the .ts file with the //.state comment before you save the .tsx file that imports it. If you do it the other way around, pubsubify will add code that tries to call a function that doesn't exist yet, and if your project reloads on save, you will get errors that make absolutely no sense (unless you've read this, in which case they will make sense).

> [!NOTE]  
> Pubsubify makes use of setters to let subscribers know about state updates. One caveat with this is that setters are not triggered when you modify an object or an array that’s already been set. 

```ts
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

The same goes for arrays, instead of using array.push() which will not trigger a state update.
You will need to spread the array into a new array and append the new item at the end and then assign that to the original array.
```ts
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


> [!NOTE]  
> Be vary of code formatters moving your `//.state` comments around.

Prettier is known to turn this
```ts
private task: CalendarTask = { //.state
    title: '',
    description: '',
};
```
into this
```ts
private task: CalendarTask = { 
    //.state
    title: '',
    description: '',
};
```
in the case of prettier you can solve it with a //prettier-ignore above the line
```ts
//prettier-ignore
private task: CalendarTask = { //.state
    title: '',
    description: '',
};
```

