/* --------------------------------------------------------------------------------------------
 * Copyright (c) Microsoft Corporation. All rights reserved.
 * Licensed under the MIT License. See License.txt in the project root for license information.
 * ------------------------------------------------------------------------------------------ */
import {
	createConnection,
	TextDocuments,
	Diagnostic,
	DiagnosticSeverity,
	ProposedFeatures,
	InitializeParams,
	DidChangeConfigurationNotification,
	CompletionItem,
	CompletionItemKind,
	TextDocumentPositionParams,
	TextDocumentSyncKind,
	InitializeResult,
	HoverParams,
	Hover,
	MarkupContent,
	Range,
	WorkspaceFolder,
	Definition,
} from 'vscode-languageserver/node';

import {
	TextDocument
} from 'vscode-languageserver-textdocument';

import { URI } from 'vscode-uri';
import * as fs from "fs";
import path = require('path');
import { MochaInstanceOptions } from 'mocha';

// Create a connection for the server, using Node's IPC as a transport.
// Also include all preview / proposed LSP features.
const connection = createConnection(ProposedFeatures.all);

// Create a simple text document manager.
const documents: TextDocuments<TextDocument> = new TextDocuments(TextDocument);

let hasConfigurationCapability = false;
let hasWorkspaceFolderCapability = false;
let hasDiagnosticRelatedInformationCapability = false;

let workspaceFolders : WorkspaceFolder[] | null;

connection.onInitialize((params: InitializeParams) => {
	const capabilities = params.capabilities;

	workspaceFolders = params.workspaceFolders;
	

	// Does the client support the `workspace/configuration` request?
	// If not, we fall back using global settings.
	hasConfigurationCapability = !!(
		capabilities.workspace && !!capabilities.workspace.configuration
	);
	hasWorkspaceFolderCapability = !!(
		capabilities.workspace && !!capabilities.workspace.workspaceFolders
	);
	hasDiagnosticRelatedInformationCapability = !!(
		capabilities.textDocument &&
		capabilities.textDocument.publishDiagnostics &&
		capabilities.textDocument.publishDiagnostics.relatedInformation
	);

	const result: InitializeResult = {
		capabilities: {
			textDocumentSync: TextDocumentSyncKind.Incremental,
			// Tell the client that this server supports code completion.
			// completionProvider: {
			// 	resolveProvider: true
			// },
			hoverProvider: true,
			definitionProvider: true
		}
	};
	if (hasWorkspaceFolderCapability) {
		result.capabilities.workspace = {
			workspaceFolders: {
				supported: true
			}
		};
	}
	return result;
});

async function searchDirectory( directoryPath: string ) {
	// console.log("folder name: '" + directoryPath );
	const files = fs.readdirSync( directoryPath, { withFileTypes: true } );

	files?.forEach( (file) => {
		if( file.isFile() ) {
			if( file.name.toLowerCase().endsWith(".yml") ) {
				console.log("file name: '" + file.name );
				updateYmlItem(directoryPath + "/" + file.name);
			}
		}
		else if( file.isDirectory() ) {
			searchDirectory( directoryPath + "/" + file.name );
		}
	} );
}

connection.onInitialized(() => {
	if (hasConfigurationCapability) {
		// Register for all configuration changes.
		connection.client.register(DidChangeConfigurationNotification.type, undefined);
	}
	if (hasWorkspaceFolderCapability) {
		connection.workspace.onDidChangeWorkspaceFolders(_event => {
			connection.console.log('Workspace folder change event received.');
		});
	}

	workspaceFolders?.forEach( (w) => {
		const dirPath = URI.parse( w.uri ).fsPath;
		searchDirectory(dirPath);
	});

});

// The example settings
interface ExampleSettings {
	maxNumberOfProblems: number;
}

interface YmlItem {
	itemName: string,
	uri: string,
	range: Range,
	description: string
}

// The global settings, used when the `workspace/configuration` request is not supported by the client.
// Please note that this is not the case when using this server with the client provided in this example
// but could happen with other clients.
const defaultSettings: ExampleSettings = { maxNumberOfProblems: 1000 };
let globalSettings: ExampleSettings = defaultSettings;

// Cache the settings of all open documents
const documentSettings: Map<string, Thenable<ExampleSettings>> = new Map();

connection.onDidChangeConfiguration(change => {
	if (hasConfigurationCapability) {
		// Reset all cached document settings
		documentSettings.clear();
	} else {
		globalSettings = <ExampleSettings>(
			(change.settings.yaskawaMarkupLanguageClient || defaultSettings)
		);
	}

	// Revalidate all open text documents
	// documents.all().forEach(validateTextDocument);
	documents.all().forEach(updateYmlItemText);
});

function getDocumentSettings(resource: string): Thenable<ExampleSettings> {
	if (!hasConfigurationCapability) {
		return Promise.resolve(globalSettings);
	}
	let result = documentSettings.get(resource);
	if (!result) {
		result = connection.workspace.getConfiguration({
			scopeUri: resource,
			section: 'yaskawaMarkupLanguageClient'
		});
		documentSettings.set(resource, result);
	}
	return result;
}

// Only keep settings for open documents
documents.onDidClose(e => {
	documentSettings.delete(e.document.uri);
});

// The content of a text document has changed. This event is emitted
// when the text document first opened or when its content has changed.
documents.onDidChangeContent(change => {
	// validateTextDocument(change.document);
	updateYmlItemText( change.document );
});

// async function validateTextDocument(textDocument: TextDocument): Promise<void> {
// 	// In this simple example we get the settings for every validate run.
// 	const settings = await getDocumentSettings(textDocument.uri);

// 	// The validator creates diagnostics for all uppercase words length 2 and more
// 	const text = textDocument.getText();
// 	const pattern = /\b[A-Z]{2,}\b/g;
// 	let m: RegExpExecArray | null;

// 	let problems = 0;
// 	const diagnostics: Diagnostic[] = [];
// 	while ((m = pattern.exec(text)) && problems < settings.maxNumberOfProblems) {
// 		problems++;
// 		const diagnostic: Diagnostic = {
// 			severity: DiagnosticSeverity.Information,
// 			range: {
// 				start: textDocument.positionAt(m.index),
// 				end: textDocument.positionAt(m.index + m[0].length)
// 			},
// 			message: `${m[0]} is all uppercase.`,
// 			source: 'ex'
// 		};
// 		if (hasDiagnosticRelatedInformationCapability) {
// 			diagnostic.relatedInformation = [
// 				{
// 					location: {
// 						uri: textDocument.uri,
// 						range: Object.assign({}, diagnostic.range)
// 					},
// 					message: 'Spelling matters'
// 				},
// 				{
// 					location: {
// 						uri: textDocument.uri,
// 						range: Object.assign({}, diagnostic.range)
// 					},
// 					message: 'Particularly for names'
// 				}
// 			];
// 		}
// 		diagnostics.push(diagnostic);
// 	}

// 	// Send the computed diagnostics to VSCode.
// 	connection.sendDiagnostics({ uri: textDocument.uri, diagnostics });
// }


// connection.onDidChangeWatchedFiles(_change => {
// 	// Monitored files have change in VSCode
// 	connection.console.log('We received an file change event');
// });

// This handler provides the initial list of the completion items.
// connection.onCompletion(
// 	(_textDocumentPosition: TextDocumentPositionParams): CompletionItem[] => {
// 		// The pass parameter contains the position of the text document in
// 		// which code complete got requested. For the example we ignore this
// 		// info and always provide the same completion items.
// 		return [
// 			{
// 				label: 'TypeScript',
// 				kind: CompletionItemKind.Text,
// 				data: 1
// 			},
// 			{
// 				label: 'JavaScript',
// 				kind: CompletionItemKind.Text,
// 				data: 2
// 			}
// 		];
// 	}
// );

// This handler resolves additional information for the item selected in
// the completion list.
// connection.onCompletionResolve(
// 	(item: CompletionItem): CompletionItem => {
// 		if (item.data === 1) {
// 			item.detail = 'TypeScript details';
// 			item.documentation = 'TypeScript documentation';
// 		} else if (item.data === 2) {
// 			item.detail = 'JavaScript details';
// 			item.documentation = 'JavaScript documentation';
// 		}
// 		return item;
// 	}
// );

/**
 * Inform Commands description
 */
//  const itemMap = new Map([
// 	["Item", "The ancestor of all geometric types (visual or not)."],
// 	["Text", "Text as specified in selectable font and size."],
// 	["Label", "Text used as the label for a UI control. Defaults to larger font size."],
// 	["TextField", "An field of text editable by the user. When clicked/focused will cause the on-screen virtual keyboard or keypad to show."],
// 	["Button", "Button"],
// 	["HelpButton", "On-screen help information (appears via pop-up). The file or file data must be registered though API registerHTMLFile() or registerHTMLData() functions prior to instantiation."],
// 	["CheckBox", "A selectable option (binary checked/unchecked) with optional label text."],
// 	["RadioButton", "A selectable option (binary checked/unchecked) with optional label text. Typically used to select one option from a set of options. When multiple radio buttons are under the same parent, only one of them can be checked at any given time."],
// ]);
const itemMap = new Map<string, YmlItem>();

async function updateYmlItemText( textDocument: TextDocument ) {
	updateYmlItem( URI.parse( textDocument.uri).fsPath );
}

async function updateYmlItem(ymlPath: string): Promise<void> {

	console.log("updateYmlItem: " + ymlPath);

	try{
		const text = fs.readFileSync( ymlPath, "utf-8" );

		const lines = text.replace("\r\n","\n").split("\n");
	
		lines?.forEach( (line, lineNo) => {
			// e.g.) MyUtility : Utility
			const pattern = /(^|\s)([A-Z][A-Za-z0-9_]*)\s*:\s*([A-Z][A-Za-z0-9_]*)($|\s)/g;
			let m: RegExpExecArray | null;
			while ((m = pattern.exec(line)) ) {
				console.log("new yml item found: '" + m[2] + "', '" + m[3] + "'" + " lineNo: " + lineNo );
				itemMap.set( m[2], {
					itemName: m[2], 
					uri: URI.file(ymlPath).toString(),
					range: Range.create( lineNo, m.index, lineNo, m.index + m[2].length ),
					description: m[3]
				} );
				
			}
	
		} );
	
	}
	catch(err) {
		console.log("cannot read file: " + ymlPath);
	}


}

connection.onHover( 
	(hoverParams: HoverParams): Hover | null  => {

		const document = documents.get(hoverParams.textDocument.uri);
		const pos = hoverParams.position;
		const lineRange = Range.create( pos.line, 0, pos.line+1, 0 );

		let lineText: string;
		
		if(document != null)
		{
			lineText = document.getText( lineRange );
			const pattern = /\b[A-Z][A-Za-z0-9_]+\b/g;

			let m: RegExpExecArray | null;
			const posInLine = pos.character - lineRange.start.character;

			while ((m = pattern.exec(lineText)) ) {
				//console.log( m[0] + " index: " + m.index + "length: " + m[0].length + " pos:" + posInLine );
				if( posInLine < m.index || m.index + m[0].length < posInLine ) {
					continue;
				}
				const item = m[0];
				const ymlItem = itemMap.get( item );
				if(ymlItem != undefined) {
					return {
						contents: item + ": " + ymlItem.description
					};
				}
			}
	
		}

	
		return null;
	}
);

connection.onDefinition(
	(definitionParams ) : Definition | null => {
		const document = documents.get(definitionParams.textDocument.uri);
		const pos = definitionParams.position;
		const lineRange = Range.create( pos.line, 0, pos.line+1, 0 );

		let lineText: string;
		
		if(document != null)
		{
			lineText = document.getText( lineRange );
			const pattern = /\b[A-Z][A-Za-z0-9_]+\b/g;

			let m: RegExpExecArray | null;
			const posInLine = pos.character - lineRange.start.character;

			while ((m = pattern.exec(lineText)) ) {
				//console.log( m[0] + " index: " + m.index + "length: " + m[0].length + " pos:" + posInLine );
				if( posInLine < m.index || m.index + m[0].length < posInLine ) {
					continue;
				}
				const item = m[0];
				const ymlItem = itemMap.get( item );
				if(ymlItem != undefined) {
					console.log("uri: " + ymlItem.uri);
					return {
						uri: ymlItem.uri,
						range: ymlItem.range //Range.create(0,0,0,0)
					};
				}
			}
	
		}

	
		return null;
	}
);


// Make the text document manager listen on the connection
// for open, change and close text document events
documents.listen(connection);

// Listen on the connection
connection.listen();
