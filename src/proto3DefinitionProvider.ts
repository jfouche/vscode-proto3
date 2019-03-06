import vscode = require('vscode');
const parser = require('./proto3Parser.js');


class Definition {
    constructor(readonly name: string, readonly uri: vscode.Uri, readonly location: ProtoLocation) {
    }

    toUripos() {
        return new UriPosition(this.uri, new vscode.Position(this.location.start.line - 1, this.location.start.column - 1));
    }
}

interface ProtoObject {
    syntax: string;
    content: Array<ProtoContent>;
}

interface ProtoContent {
    type: string;
}

interface ObjectDefinition {
    name: string;
    location: ProtoLocation;
}

interface ProtoMessage {
    type: string;
    definition: ObjectDefinition;
    content: Array<ProtoContent>;
    location: ProtoLocation;
}

interface ProtoEnum {
    type: string;
    name: string;
    definition: ObjectDefinition;
}

interface ProtoLocation {
    start: ProtoPosition;
    end: ProtoPosition;
}

interface ProtoPosition {
    offset: number;
    line: number;
    column: number;
}

/**
 * @class ParserResult
 */
class ParserResult {
    private readonly definitions: Array<Definition> = [];

    public add(uri: vscode.Uri, obj: ProtoObject) {
        for (const o of obj.content) {
            this.addContent(uri, o);
        }
    }

    public getDefinition(name: string): Definition {
        return this.definitions.find((definition) => {
            return definition.name === name;
        });
    }

    public getNamespaceAt(line: number): string {
        let ns = "";
        for (const d of this.definitions) {
            if ((d.location.start.line <= line) && (line < d.location.end.line)) {
                const l = d.name.lastIndexOf(".");
                if (l > ns.length) {
                    ns = d.name.slice(0, l);
                }
            }
        }
        return ns;
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
        this.addDef(uri, prefix + msg.definition.name, msg.definition.location);
        for (const c of msg.content) {
            this.addContent(uri, c, prefix + msg.definition.name + ".");
        }
    }

    private addEnum(uri: vscode.Uri, msg: ProtoEnum, prefix: string = "") {
        this.addDef(uri, prefix + msg.name, msg.definition.location);
    }

    private addDef(uri: vscode.Uri, name: string, range: ProtoLocation) {
        this.definitions.push(new Definition(name, uri, range));
    }
}

/**
 * @class Parser
 */
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
    const lineText = document.lineAt(position.line).text;
    const lineTillCurrentPosition = lineText.substr(0, position.character);

    // Count the number of double quotes in the line till current position. Ignore escaped double quotes
    let doubleQuotesCnt = (lineTillCurrentPosition.match(/\"/g) || []).length;
    const escapedDoubleQuotesCnt = (lineTillCurrentPosition.match(/\\\"/g) || []).length;

    doubleQuotesCnt -= escapedDoubleQuotesCnt;
    return doubleQuotesCnt % 2 === 1;
}

/**
 * 
 */
class UriPosition {
    constructor(readonly uri: vscode.Uri, readonly pos: vscode.Position) {
    }
}

/**
 * 
 * @param document 
 * @param position 
 * @param token 
 */
function definitionLocation(document: vscode.TextDocument, position: vscode.Position, token: vscode.CancellationToken): Promise<UriPosition> {
    const wordRange = document.getWordRangeAtPosition(position);
    const lineText = document.lineAt(position.line).text;
    const word = wordRange ? document.getText(wordRange) : '';
    if (!wordRange || lineText.startsWith('//') || isPositionInString(document, position) || word.match(/^\d+.?\d+$/)) {
        return Promise.resolve(null);
    }

    return new Promise<UriPosition>((resolve, reject) => {
        const uri = document.uri;
        try {
            const parser = new Parser(document);
            const result = parser.parse();
            const ns = result.getNamespaceAt(position.line);
            const definition = result.getDefinition(ns + word);
            if (!definition) {
                return resolve(null);
            }
            return resolve(definition.toUripos());
        } catch (error) {
            // bad parsing, fallback mode
            // TODO : better handling
            const pos = document.getText().indexOf("message " + word);
            if (pos == -1) {
                return resolve(null);
            }
            return resolve(new UriPosition(uri, document.positionAt(pos + 8)));
        }
    });
}

/**
 * 
 */
export class Proto3DefinitionProvider implements vscode.DefinitionProvider {

    public provideDefinition(doc: vscode.TextDocument, pos: vscode.Position, token: vscode.CancellationToken): Thenable<vscode.Location> {
        return definitionLocation(doc, pos, token).then(definitionInfo => {
            return new vscode.Location(definitionInfo.uri, definitionInfo.pos);
        });
    }
}