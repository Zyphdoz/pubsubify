import fs from 'fs';
import path from 'path';
import chokidar from 'chokidar';
import fse from 'fs-extra';

const sourceDir = './';
const destDir = '../pubsubify_output';

let file = {
    hasStateComment: false,
    extension: '',
    name: '',
    lines: [],
    linesWithStateComment: [],
    linesWithGetter: [],
    linesWithSetter: [],
    modifiedContent: [],

    reset() {
        this.hasStateComment = false;
        this.extension = '';
        this.name = '';
        this.lines = [];
        this.linesWithStateComment = [];
        this.linesWithGetter = [];
        this.linesWithSetter = [];
        this.modifiedContent = [];
    },

    setExtension(extension) {
        this.extension = extension;
    },

    parse(srcPath) {
        this.lines = fs.readFileSync(srcPath, 'utf8').split('\n');
        for (const line of this.lines) {
            const lineContainsStateComment = /\/\/ ?.state/.test(line);
            const lineContainsGetter = /\bget\s+\w+\s*\(/.test(line);
            const lineContainsSetter = /\bset\s+\w+\s*\(/.test(line);
            if (lineContainsStateComment) {
                this.linesWithStateComment.push(line);
                this.hasStateComment = true;
                return;
            } else if (lineContainsGetter) {
                this.linesWithGetter.push(line);
            } else if (lineContainsSetter) {
                this.linesWithSetter.push(line);
            }
        }
    },

    generateModifiedContent() {
        if (file.extension === '.tsx') {
            this.addUseStateAndUseEffectImportStatements();
            this.addPubsubLogicToSubscriber();
        } else if (file.extension === '.ts') {
            this.addPubsubLogicToPublisher();
        }
    },

    addPubsubLogicToPublisher() {
        let appendNotifySubscribersToEndOfThisSetter = [];

        // get names of getter and setters
        const getters = this.linesWithGetter.map((line) => {
            const getterInLastIndex = line.split('(')[0].split(' ');
            return getterInLastIndex[getterInLastIndex.length - 1];
        });

        const setters = this.linesWithSetter.map((line) => {
            const setterInLastIndex = line.split('(')[0].split(' ');
            return setterInLastIndex[setterInLastIndex.length - 1];
        });

        for (let i = 0; i < this.lines.length; i++) {
            // i is also incremented elsewhere in this loop
            const line = this.lines[i];
            const lineIsFirstLineOfClassDeclaration = line.indexOf(`class `) === -1 ? false : true;

            this.modifiedContent.push(line);

            // if line starts with class, add pubsub functions.
            if (lineIsFirstLineOfClassDeclaration) {
                this.modifiedContent.push('    private subscribers = [];');
                this.modifiedContent.push('');
                this.modifiedContent.push('    subscribe(fn) {');
                this.modifiedContent.push('        this.subscribers.push(fn);');
                this.modifiedContent.push('    }');
                this.modifiedContent.push('');
                this.modifiedContent.push('    unsubscribe(fn) {');
                this.modifiedContent.push('        this.subscribers.splice(this.subscribers.indexOf(fn), 1);');
                this.modifiedContent.push('    }');
                this.modifiedContent.push('');
                this.modifiedContent.push('    private notifySubscribers() {');
                this.modifiedContent.push('        this.subscribers.forEach(fn => {');
                this.modifiedContent.push('            fn();');
                this.modifiedContent.push('        })');
                this.modifiedContent.push('    }');
            }

            // if current line has state comment,
            if (/\/\/ ?.state/.test(line)) {
                const stateVariableInLastIndex = line.split(' = ')[0].split(' ');
                let stateVariableName = stateVariableInLastIndex[stateVariableInLastIndex.length - 1];
                const stateVariableStartsWithUnderscore = stateVariableName.indexOf('_') === 0 ? true : false;

                if (stateVariableStartsWithUnderscore) {
                    stateVariableName = stateVariableName.substring(1);
                }
                // if this variable doesn't have getters or setters, add underscore and add getters and setters
                if (!getters.includes(stateVariableName) && !setters.includes(stateVariableName)) {
                    // last index of this.modifiedContent contains the line with the state comment so that is where we add the underscore to the variable name
                    this.modifiedContent[this.modifiedContent.length - 1] = this.modifiedContent[
                        this.modifiedContent.length - 1
                    ].replace(`${stateVariableName}`, `_${stateVariableName}`);
                    this.modifiedContent.push('');
                    this.modifiedContent.push(`    get ${stateVariableName}() {`);
                    this.modifiedContent.push(`        return this._${stateVariableName};`);
                    this.modifiedContent.push('    }');
                    this.modifiedContent.push('');
                    this.modifiedContent.push(`    set ${stateVariableName}(value) {`);
                    this.modifiedContent.push(`        this._${stateVariableName} = value;`);
                    this.modifiedContent.push('        this.notifySubscribers();');
                    this.modifiedContent.push('    }');
                } else if (!getters.includes(stateVariableName)) {
                    this.modifiedContent.push('');
                    this.modifiedContent.push(`    get ${stateVariableName}() {`);
                    this.modifiedContent.push(`        return this.${stateVariableName};`);
                    this.modifiedContent.push('    }');
                } else if (!setters.includes(stateVariableName)) {
                    this.modifiedContent.push('');
                    this.modifiedContent.push(`    set ${stateVariableName}() {`);
                    this.modifiedContent.push(`        this.${stateVariableName} = value;`);
                    this.modifiedContent.push('        this.notifySubscribers();');
                    this.modifiedContent.push('    }');
                } else if (setters.includes(stateVariableName)) {
                    appendNotifySubscribersToEndOfThisSetter.push(stateVariableName);
                }
            }

            // if current line is setter and it is missing this.notifySubscribers(), add this.notifySubscribers()
            if (this.linesWithSetter.includes(line)) {
                const shouldAppendNotifySubscribersToEndOfSetter = appendNotifySubscribersToEndOfThisSetter.some(
                    (setter) => setters.includes(setter)
                );

                if (shouldAppendNotifySubscribersToEndOfSetter) {
                    let openCurlyCount = (line.match(/{/g) || []).length;
                    let closeCurlyCount = (line.match(/}/g) || []).length;
                    const setterIsAOneLiner = openCurlyCount === closeCurlyCount;

                    if (setterIsAOneLiner) {
                        // assumes the syntax looks something like this:
                        // set myProperty(value: number) { this._myProperty = value; }

                        const [setterDefinition, setterImplementation] = line.split('}')[0].split('{');
                        this.modifiedContent[this.modifiedContent.length - 1] = `    ${setterDefinition.trim()} {`;
                        this.modifiedContent.push(`        ${setterImplementation.trim()}`);
                        this.modifiedContent.push('        this.notifySubscribers();');
                        this.modifiedContent.push('    }');
                    } else
                        while (openCurlyCount !== closeCurlyCount) {
                            i++;
                            const line = this.lines[i];
                            openCurlyCount += (line.match(/{/g) || []).length;
                            closeCurlyCount += (line.match(/}/g) || []).length;
                            this.modifiedContent.push(line);

                            if (openCurlyCount === closeCurlyCount) {
                                const copyOfLastIndex = this.modifiedContent[this.modifiedContent.length - 1];
                                this.modifiedContent[this.modifiedContent.length - 1] =
                                    '        this.notifySubscribers();';
                                this.modifiedContent.push(copyOfLastIndex);
                            }
                        }
                }
            }
        }
    },

    addPubsubLogicToSubscriber() {
        // add logic that subscribes to updates from state and triggers a rerender when the state changes
        for (const line of this.lines) {
            const lineContainsFunctionWithSameNameAsFile = line.indexOf(`${this.name}(`) === -1 ? false : true;

            this.modifiedContent.push(line);

            if (lineContainsFunctionWithSameNameAsFile) {
                this.modifiedContent.push(
                    '    const [someNumberToForceRerender, setSomeNumberToForceRerender] = useState<number>(0);'
                );
                this.modifiedContent.push('');
                this.modifiedContent.push('    useEffect(() => {');
                for (const lineWithStateComment of this.linesWithStateComment) {
                    const objectNamesInImportStatement = lineWithStateComment
                        .split('{')[1]
                        .split('}')[0]
                        .split(',')
                        .map((objectName) => {
                            return objectName.trim();
                        });
                    for (const objectName of objectNamesInImportStatement) {
                        this.modifiedContent.push(`      ${objectName}.subscribe(reRender);`);
                    }
                }
                this.modifiedContent.push('');
                this.modifiedContent.push('      return () => {');
                for (const lineWithStateComment of this.linesWithStateComment) {
                    const objectNamesInImportStatement = lineWithStateComment
                        .split('{')[1]
                        .split('}')[0]
                        .split(',')
                        .map((objectName) => {
                            return objectName.trim();
                        });
                    for (const objectName of objectNamesInImportStatement) {
                        this.modifiedContent.push(`      ${objectName}.unsubscribe(reRender);`);
                    }
                }
                this.modifiedContent.push('      }');
                this.modifiedContent.push('    }, [])');
                this.modifiedContent.push('');
                this.modifiedContent.push('    function reRender() {');
                this.modifiedContent.push('      setSomeNumberToForceRerender(prevNumber => prevNumber + 1);');
                this.modifiedContent.push('    }');
            }
        }
    },

    addUseStateAndUseEffectImportStatements() {
        let shouldAddUseStateImport = true;
        let shouldAddUseEffectImport = true;
        for (const line of this.lines) {
            const lineImportsUseState = /import.*useState.*|.*\/\/.*useState/.test(line);
            const lineImportsUseEffect = /import.*useEffect.*|.*\/\/.*useEffect/.test(line);
            if (lineImportsUseEffect) {
                shouldAddUseEffectImport = false;
            }
            if (lineImportsUseState) {
                shouldAddUseStateImport = false;
            }
        }
        if (shouldAddUseEffectImport) this.modifiedContent.push('import { useEffect } from "react"');
        if (shouldAddUseStateImport) this.modifiedContent.push('import { useState } from "react"');
    },
};

function copyFile(srcPath, destPath) {
    file.reset();
    file.setExtension(path.extname(srcPath).toLowerCase());

    if (file.extension === '.ts' || file.extension === '.tsx') {
        file.parse(srcPath);
        if (file.hasStateComment) {
            file.name = path.parse(srcPath).name;
            file.generateModifiedContent();
            fs.writeFileSync(destPath, file.modifiedContent.join('\n'), 'utf8');
        } else {
            fse.copySync(srcPath, destPath);
        }
    } else {
        fse.copySync(srcPath, destPath);
    }
}

function copyFilesOnStart() {
    const files = fse.readdirSync(sourceDir, { withFileTypes: true });
    files.forEach((file) => {
        const srcPath = path.join(sourceDir, file.name);
        const destPath = path.join(destDir, file.name);

        if (!fs.existsSync(destPath)) {
            copyFile(srcPath, destPath);
        }
    });
}

function watchForChangesAndMirror() {
    const watcher = chokidar.watch(sourceDir, {
        ignored: /node_modules/,
        persistent: true,
    });

    watcher.on('add', (srcPath) => {
        const relativePath = path.relative(sourceDir, srcPath);
        const destPath = path.join(destDir, relativePath);
        copyFile(srcPath, destPath);
    });

    watcher.on('change', (srcPath) => {
        const relativePath = path.relative(sourceDir, srcPath);
        const destPath = path.join(destDir, relativePath);
        copyFile(srcPath, destPath);
    });

    watcher.on('unlink', (srcPath) => {
        const relativePath = path.relative(sourceDir, srcPath);
        const destPath = path.join(destDir, relativePath);
        if (fs.existsSync(destPath)) {
            fs.unlinkSync(destPath);
        }
    });

    watcher.on('addDir', (srcPath) => {
        const relativePath = path.relative(sourceDir, srcPath);
        const destPath = path.join(destDir, relativePath);
        fs.mkdirSync(destPath, { recursive: true });
    });

    watcher.on('unlinkDir', (srcPath) => {
        const relativePath = path.relative(sourceDir, srcPath);
        const destPath = path.join(destDir, relativePath);
        if (fs.existsSync(destPath)) {
            fs.removeSync(destPath);
        }
    });
}

copyFilesOnStart();
watchForChangesAndMirror();