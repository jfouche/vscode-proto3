import vscode = require('vscode');
const parser = require('./proto3Parser.js');


class Definition {
    constructor(readonly file: vscode.Uri, readonly pos: vscode.Position) {
    }
}

interface Definitions {
    [index: string]: Definition;
}

interface ProtoObject {
    syntax: string;
    content: Array<ProtoContent>;
}

interface ProtoContent {
    type: string;
}

interface ProtoMessage {
    type: string;
    name: string;
    content: Array<ProtoContent>;
    pos: ProtoPosition;
}

interface ProtoEnum {
    type: string;
    name: string;
    pos: ProtoPosition;
}

interface ProtoPosition {
    start: Location;
    end: Location;
}

interface Location {
    offset: number;
    line: number;
    column: number;
}

class ParserResult {
    private readonly definitions: Definitions = {};

    public add(uri: vscode.Uri, obj: ProtoObject) {
        for (let o of obj.content) {
            this.addContent(uri, o);
        }
    }

    public getDefinition(name: string): Definition {
        if (this.definitions[name]) {
            return this.definitions[name];
        }
        return undefined;
    }

    private addContent(uri: vscode.Uri, content: ProtoContent, prefix: string = "") {
        if (content.type == "message") {
            this.addMessage(uri, content as ProtoMessage, prefix);
        }
        else if (content.type == "enum") {
            this.addEnum(uri, content as ProtoEnum, prefix);
        }
    }

    private addMessage(uri: vscode.Uri, msg: ProtoMessage, prefix: string = "") {
        this.addDef(uri, prefix + msg.name, msg.pos);
        for (const c of msg.content) {
            this.addContent(uri, c, prefix + msg.name + ".");
        }
    }

    private addEnum(uri: vscode.Uri, msg: ProtoEnum, prefix: string = "") {
        this.addDef(uri, prefix + msg.name, msg.pos);
    }

    private addDef(uri: vscode.Uri, name: string, pos: ProtoPosition) {
        const p = new vscode.Position(pos.start.line - 1, pos.start.column - 1);
        this.definitions[name] = new Definition(uri, p);
    }
}

class Parser {
    private readonly document: vscode.TextDocument;

    constructor(document: vscode.TextDocument) {
        this.document = document;
    }

    public parse(): ParserResult {
        const data = parser.parse(this.document.getText()) as ProtoObject;
        console.log(data);
        const result = new ParserResult();
        result.add(this.document.uri, data);
        return result;
    }
}


/**
 * Check if a position in inside a string
 * @param document 
 * @param position 
 */
function isPositionInString(document: vscode.TextDocument, position: vscode.Position): boolean {
    let lineText = document.lineAt(position.line).text;
    let lineTillCurrentPosition = lineText.substr(0, position.character);

    // Count the number of double quotes in the line till current position. Ignore escaped double quotes
    let doubleQuotesCnt = (lineTillCurrentPosition.match(/\"/g) || []).length;
    let escapedDoubleQuotesCnt = (lineTillCurrentPosition.match(/\\\"/g) || []).length;

    doubleQuotesCnt -= escapedDoubleQuotesCnt;
    return doubleQuotesCnt % 2 === 1;
}

/**
 * 
 * @param document 
 * @param position 
 * @param token 
 */
function definitionLocation(document: vscode.TextDocument, position: vscode.Position, token: vscode.CancellationToken): Promise<Definition> {
    const wordRange = document.getWordRangeAtPosition(position);
    const lineText = document.lineAt(position.line).text;
    const word = wordRange ? document.getText(wordRange) : '';
    if (!wordRange || lineText.startsWith('//') || isPositionInString(document, position) || word.match(/^\d+.?\d+$/)) {
        return Promise.resolve(null);
    }

    const parser = new Parser(document);
    const result = parser.parse();
    console.log(result);
    const definition = result.getDefinition(word);
    if (!definition) {
        return Promise.resolve(null);
    }

    return Promise.resolve(definition);
    
    /*
    return new Promise<Definition>((resolve, reject) => {
        let pos = document.getText().indexOf("message " + word);
        if (pos == -1) {
            return Promise.resolve(null);
        }

        let definitionInfo = {
            file: document.uri,
            pos: document.positionAt(pos + 8)
        };
        return resolve(definitionInfo);
    });*/
}

/**
 * 
 */
export class Proto3DefinitionProvider implements vscode.DefinitionProvider {

    constructor() {
    }

    public provideDefinition(document: vscode.TextDocument, position: vscode.Position, token: vscode.CancellationToken): Thenable<vscode.Location> {
        return definitionLocation(document, position, token).then(definitionInfo => {
            return new vscode.Location(definitionInfo.file, definitionInfo.pos);
        });
    }
}