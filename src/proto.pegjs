proto = ws? a:syntax b:(import / package / option / emptyStatement / message / enum / service / ws)*
{
	var arr = {syntax: a.syntax};
    arr.content = b.filter(function(a){return a !== undefined});
	return arr;
}

comment = "//" [ A-Za-z0-9._-]* ("\n" / "\r\n") 
{}
rws = [ \r\n\t]+ / comment // Real white space
{}
ws = rws
{}

letter = [A-Za-z]
decDigit = [0-9]
octDigit = [0-7]
hexDigit = [0-9A-Fa-f]
ident = a:letter b:(letter / decDigit / "_")*
{ return a+b.join("") }
fullIdent = a:ident b:("." ident)*
{ b.unshift([a]); return b.map(function(c){return c.join('')}).join('') }

messageName = a:ident
{
	return {
		name:a,
		location: location()
	}
}
enumName = ident
{
	return {
		name:a,
		location: location()
	}
}

fieldName = ident
oneofName = ident
mapName = ident
serviceName = ident
rpcName = ident

messageType = a:"."? b:(ident ".")* c:messageName
{ return (a == '.' ? '.' : '')+b.map(function(a){return a.join('')}).join('')+c }
enumType = a:"."? b:(ident ".")* c:enumName
{ return (a == '.' ? '.' : '')+b.map(function(a){return a.join('')}).join('')+c }

intLit     = decimalLit / octalLit / hexLit
decimalLit = a:("0" / [1-9] decDigit*)
{ return parseInt(a[0]+a[1]) }
octalLit   = "0" a:octDigit+
{ return parseInt(a, 8) }
hexLit     = "0" [xX] a:hexDigit+  
{ return parseInt(a, 16) }

floatLit = (decimals "." decimals? exponent?) / (decimals exponent) / ("." decimals exponent? ) / "inf" / "nan"
decimals  = decDigit+
exponent  = [eE]? [+-]? decimals 

boolLit = "true" / "false" 

strLit = obj:( "'" charValue* "'" ) / obj:( '"' charValue* '"' )
{ return obj[1].join('') }
charValue = hexEscape / octEscape / charEscape / [^\0\n\\\"\']
hexEscape = '\\' [xX] hexDigit hexDigit
octEscape = '\\' octDigit octDigit octDigit
quote = [\"\']
charEscape = '\\' [abfnrtv\"\'\\]


emptyStatement = ";"
{}

constant = strLit / fullIdent / ( [-+]? intLit ) / ( [-+]? floatLit ) / boolLit

syntax = "syntax" ws? "=" ws? quote val:("proto2" / "proto3") quote ws? ";"
{ return { type: "syntax", syntax: val } }

import = "import" ws? mod:("weak" / "public")? ws? pkg:strLit ws? ";"
{ return {type: "import", package: pkg, modifier: mod } }

package = "package" ws? val:fullIdent ws? ";"
{ return { type: "package", package: val } }

option = "option" ws? name:optionName ws? "=" ws? val:constant ";"
{ return { type: "option", name: name, val: val } }
optionName = a:( ident / "(" fullIdent ")" ) c:("." ident)*
{ if(Array.isArray(a)) a = a.join(''); return a+(c[0] ? c[0].join('') : "") }

type = "double" / "float" / "int32" / "int64" / "uint32" / "uint64" / "sint32" / 
		"sint64" / "fixed32" / "fixed64" / "sfixed32" / "sfixed64" / "bool" / 
        "string" / "bytes" / messageType / enumType
fieldNumber = intLit

fieldOptionsParam = "[" ws? a:fieldOptions ws? "]"
{
	var opts = {};
    a.map(function(a){
          if(typeof a == 'object' && a != null)
          	opts[a.name] = a.val;
    });
	return opts;    
}

optional = "optional" ws? a:field
{
	a.optional = true;
	return a;
}

repeated = "repeated" ws? a:field
{
	a.repeated = true;
	return a;
}

required = "required" ws? a:field
{
	a.required = true;
	return a;
}

field = b:type ws? c:fieldName ws? "=" ws? d:fieldNumber ws? e:(fieldOptionsParam)? ws? ";"
{ 
	return {
      type: "field",
      typename: b,
      name: c,
      fieldNo: d,
      opts: e == null ? {} : e
	} 
}

fieldOptions = a:fieldOption ws? b:("," ws? fieldOption ws?)*
{ var arr = [a]; b.map(function(elem){arr.push(elem)}); return arr; }

fieldOption = name:optionName ws? "=" ws? val:constant
{ return {name: name, val: val} }

oneof = "oneof" ws? b:oneofName ws? "{" c:( ws / oneofField / emptyStatement)+ "}"
{ 
	var arr = [];
    c.map(function(a){
    	if(a && a.type)
        	arr.push(a);
    });
	return { type: "oneof", name: b, content: arr } 
}

oneofField = b:type ws? c:fieldName ws? "=" ws? d:fieldNumber ws? e:(fieldOptionsParam)? ws? ";"
{
	return {
      type: "field",
      typename: b,
      name: c,
      fieldNo: d,
      opts: e == null ? {} : e
	} 
}

mapField = "map" ws? "<" ws? a:keyType ws? "," ws? b:type ws? ">" ws? c:mapName ws? "=" ws? 
			d:fieldNumber ws? e:(fieldOptionsParam)? ws? ";"
{
	return {
      type: "field",
      typename: "map",
      key: a,
      value: b,
      name: c,
      fieldNo: d,
      opts: e == null ? {} : e
	}
}

keyType = "int32" / "int64" / "uint32" / "uint64" / "sint32" / "sint64" /
          "fixed32" / "fixed64" / "sfixed32" / "sfixed64" / "bool" / "string"
          
reserved = "reserved" ws ( ranges / reservedfieldNames ) ";"
reservedfieldNames = strLit ws? ("," ws? strLit)*
ranges = range ( ws? "," ws? (range) )*
range = intLit ws "to" ws intLit / intLit

enum = "enum" ws? a:enumName ws? b:enumBody
{ 
	return {
		type: 'enum', 
		name: a.name, 
		definition: a, 
		content: b.content, 
		opts: b.opts ,
		location: location()
	} 
}

enumBody = "{" a:(ws / option / enumField / emptyStatement)* "}"
{ 
	var opts = {};
    var content = [];
	for(var elem of a){
    	if(!elem)
        	continue;
        else if(elem.type == 'enumField')
        	content.push(elem);
    	else if(elem.type == 'option')
        	opts[elem.name] = elem.val;
    }
    return {content: content, opts: opts};
}

enumField = a:ident ws? "=" ws? b:intLit ws? c:(fieldOptionsParam)? ws? ";"
{
	return { type: 'enumField', name: a, val: b, opts: c == null ? {} : c };
}

message = "message" ws a:messageName ws? b:messageBody
{ 
	return {
		type: 'message', 
		definition: a, 
		content: b.content, 
		opts: b.opts, 
		location: location() 
	}
}

messageBody = "{" a:( field / optional / required / repeated / enum / message / option / oneof / mapField /reserved / emptyStatement / ws )* "}"
{ 
	var opts = {};
    var content = [];
	for(var elem of a){
    	if(!elem)
        	continue;
    	else if(elem.type == 'option')
        	opts[elem.name] = elem.val;
       	else
        	content.push(elem);
    }
    return {
		content: content, 
		opts: opts
	};
}


service = "service" ws a:serviceName ws? "{" b:( ws / option / rpc / emptyStatement )* "}"
{ 
	var opts = {};
    var content = [];
	for(var elem of b){
    	if(!elem)
        	continue;
    	else if(elem.type == 'option')
        	opts[elem.name] = elem.val;
       	else
        	content.push(elem);
    }
    return {type: "service", name: a, content: content, opts: opts};
}
rpc = "rpc" ws a:rpcName ws? "(" ws? b:("stream" ws)? c:messageType ws? ")" ws? "returns" ws? "(" ws? d:("stream" ws)? e:messageType ws? ")" ws? f:(rpcBody / ";")
{ 
	if(b && b[0] == "stream")
    	c.stream = true;
    if(d && d[0] == "stream")
    	e.stream = true;
    if( f == ";" )
    	f = {};
	return { type: "rpc", name: a, param: c, returns: e, opts: f } 
}
rpcBody = ( "{" (option / emptyStatement / ws )* "}" )