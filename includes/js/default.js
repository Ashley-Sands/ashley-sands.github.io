var headerElement = document.getElementById("content-header");
var subHeaderElement = document.getElementById("content-sub-heading");
var contentElement = document.getElementById("content-main");
var lastUpdateElement = document.getElementById("last-updated");
 
var markDownParser = new MarkDownParse();

var contentCache = {
    templates: {},
    pages: {},
    additinalContent: {}
};

var pages = [ "about", "git", "blogs"]  // assumed that the about element is the entry page
var currentPage = "";
var nextHtmlElementId = 0;

LoadContent = function()
{

    var page;
    var requestPage = location.hash.substring(1).toLowerCase();

    if ( requestPage == null || requestPage == "")
    {
        page = "about";
    }
    else if ( !pages.includes( requestPage ) )
    {
        page = "notFound";
    }
    else
    {
        page = requestPage;
    }

    if ( page == currentPage) return;

    var path = "/pages/" + page + ".json";
    var url = Const.basePath + path;

    if ( !(page in contentCache.pages) )    // load content if not in chach.
    {
        SetLoading();
        var contentRequest = new ContentObject( url, JsonFormator, (errorCO)=>HTTPErrorHandler(errorCO) );
        contentRequest.SetResponceParser( (jsonStr)=>JSParse.Parse(jsonStr) );
        contentCache.pages[page] = contentRequest;
        console.log(`loading content: ${path} `)
    }
    else
    {
        console.log( `using chached page for ${page}` )
    }

    currentPage = page;
    contentCache.pages[page].Use(); 

}

JsonFormator = function( contentObj )
{
    var json = contentObj.responce;
    var content = json.content;
    var defaultTemplate = null;
    var jsFunctions = null;
    var additionalContent = null

    if ( "~defaultTemplate" in json )
        defaultTemplate = json["~defaultTemplate"];

    if ( "jsFunctions" in json )
        jsFunctions = json.jsFunctions;

    if ( "additionalContent" in json )
    {
        additionalContent = json.additionalContent;
        LoadAdditionalContent( additionalContent, contentObj );
    }

    // load any templates, that are not already loaded
    // while blocking if any templates are still loading.


    var loadingTemplate = LoadTemplate( defaultTemplate, contentObj ); // load default template if defined
    
    for ( var i = 0; i < content.length; i++ )
    {
        let contentTemplate = "~template" in content[i] ? content[i]["~template"] : null;
        loadingTemplate = loadingTemplate || LoadTemplate( contentTemplate, contentObj );

    }

    if ( loadingTemplate ) return;  // wait for all template to be loaded.

    // unset any page content set as inUse
    for ( var i = 0; i < contentCache.pages.length; i++)
    {
        if ( contentCache.pages[i].state == 3 )
            contentCache.pages[i].SetState.Loaded();
    }

    var outputContent = "";

    if ( content.length > 0 && ( typeof content[0] == "string" || content[0] instanceof String) )
    {   // if content is supplied as a list of strings, format the content without a template.
        console.log("Building Content Without Tempalte")
        outputContent = content.join(" ");
    }
    else
    {
        console.log("Building Template Content... element count: " + content.length)

        for ( var i = 0; i < content.length; i++ )
        {
            tempCont = content[i];

            // make sure that tempCont is not a string or array.
            if ( typeof tempCont == "string" || tempCont instanceof String || tempCont instanceof Array)  // check both primitive and object
            {
                console.error("Error: Content supplied for template was a string or Array. must be json object")
                break;
            }

            keys = Object.keys( tempCont );
            var template = defaultTemplate != null ? contentCache.templates[ defaultTemplate ].responce : null ; 

            if ( "~template" in tempCont && !contentCache.templates[ tempCont["~template"] ].HasResponce() )
                continue;     
            else if ( "~template" in tempCont )
                template = contentCache.templates[ tempCont["~template"] ].responce;

            for ( var k = 0; k < keys.length; k++)
            {
                // any key starting with '~', as treated as content formating option
                // therefore the value should not be parsed to the outputContent.
                if ( keys[k][0] == "~")
                    continue;

                var contentString = "error :(";
 
                // find if the content @ key is a string or an array
                if ( typeof tempCont[keys[k]] == "string" || tempCont[keys[k]] instanceof String )
                    contentString = tempCont[ keys[ k ] ]
                else if( tempCont[keys[k]] instanceof Array )   // multipline support. values must be strings.
                    contentString = tempCont[ keys[ k ] ].join( " " );
                else
                    console.error("Error: Could not parse content into html, content is nither a string or array");

                if ( template != null)
                    template = template.replace( `{${keys[k]}}`, contentString );
                else    // if there no template parse the content directly into the output.
                    outputContent += contentString;

            }

            if ( template != null )
                outputContent += template;

        }
    }

    if ( additionalContent != null )
        outputContent = FormatContentElements( outputContent, json.additionalContent );

    headerElement.innerHTML = json.header;
    subHeaderElement.innerHTML = json.subHeader;
    contentElement.innerHTML = outputContent == "" ? "<p class='center'>No Content :(</p>" : outputContent;

    contentObj.SetState.InUse();  //<< this breaks things :|

    if ( "Last-Modified" in contentObj.responceHeaders )
    {
        lastUpdateElement.innerHTML = `Last Updated<br />${contentObj.responceHeaders["Last-Modified"]}`
    }

    if ( jsFunctions != null )
        for ( var i = 0; i < jsFunctions.length; i++)
        {
            TriggerFunction( jsFunctions[i] );
        }

}

TriggerFunction = function( functName )
{
    /** Triggers function with funct name
     *  iv decided to do this rather then use eval so i dont have to deal with any security floors
     */
    switch( functName.toLowerCase() )
    {
        case "age":
            document.getElementById("age").innerHTML = Common.Age();
            break;
        case "started-years-ago":
            document.getElementById("started-years-ago").innerHTML = Common.StartedYearsAgo();
            break;
        case "hash":
            document.getElementById("error-hash").innerHTML = location.hash.substring(1).toLowerCase();
    }
}

LoadTemplate = function( templateName, parentRequest )
{
    /**
     * Loads Template if not already loaded/chached, immediately cachcing the content obj
     * @return: false if null teplate, otherwise if template.IsLoading().
     */

    if ( templateName == null ) return false;
    else if ( templateName in contentCache.templates ) return contentCache.templates[ templateName ].IsLoading();

    var templateRequest = new ContentObject( Const.basePath + "/pages/templates/" + templateName + ".html",
                                             CacheTemplate, 
                                             (errorCO)=>HTTPErrorHandler(errorCO),
                                             parentRequest    );

    templateRequest.Load();
    contentCache.templates[ templateName ] = templateRequest;

    return contentCache.templates[ templateName ].IsLoading()

}

CacheTemplate = function( contentObj )
{

    if ( !contentObj.Usable() )
    {
        console.log("Error reciving template.");
        return;
    }

    // trigger the parent if available
    if ( contentObj.parent != null )
    {
        contentObj.parent.callback( contentObj.parent );
        contentObj.parent = null;
    }

}

FormatContentElements = function( contentString, additionalContentJsonObj ){

    // Replace any formating elements with html elements  
    // inputing any content that is already available in the cache only if the key is matched
    
    var regex = /\$\{([a-zA-Z][a-zA-Z0-9-_]*)(?<![-_])\}/;
    var reMatch = regex.exec( contentString );

    var keys = Object.keys(additionalContentJsonObj);
    while( reMatch != null )
    {

        var cachedResponce = "";
        var elementId = reMatch[1] +"-"+ nextHtmlElementId++;

        for ( var i = keys.length-1; i >= 0 ; i-- )
        {
            var key = keys[i];
            var match = false;

            if ( reMatch[1] == key )                                        // match AC key 
            {
                if ( contentCache.additinalContent[ key ].HasResponce() )
                    cachedResponce = contentCache.additinalContent[ key ].responce;
                
                match = true;
            }
            else if ( reMatch[1] == additionalContentJsonObj[key].map )     // match maps
            {
                match = true;
            }

            // remove the matched elements
            if ( match )
            {
                contentCache.additinalContent[ key ].htmlElementId = elementId;
                contentCache.additinalContent[ key ].htmlElement = null;
                keys.splice(i);
            }

        }

        var elementString = `<span id="${elementId}">${cachedResponce}</span>`;
        contentString = contentString.replace( reMatch[0], elementString );

        if ( keys.length == 0) break;
        reMatch = regex.exec( contentString );

    }

    return contentString;

}

LoadAdditionalContent = function( additinalContent, requestParent )
{

    var contentKeys = Object.keys( additinalContent );

    for ( var i = 0; i < contentKeys.length; i++ )
    {
        var contentKey = contentKeys[i];
        var contentValue = additinalContent[contentKey];
        var contentRequest = null;

        if ( !(contentKey in contentCache.additinalContent) )
        {
            contentRequest = new ContentObject( contentValue.url, HandleAdditinalContent, (errorCO)=>HTTPErrorHandler(errorCO), requestParent, true );
            contentRequest.callbackParams = [contentKey];

            if ( contentValue.parseMd )
                contentRequest.SetResponceParser( (mdStr)=>markDownParser.parse(mdStr) );

            // Cache the content :)
            contentCache.additinalContent[ contentKey ] = contentRequest;
            
            console.log(`Creating Content Object for ${contentKey} (ADC)`);
        }
        else
        {
            contentRequest = contentCache.additinalContent[ contentKey ];
            contentRequest.parent = requestParent;      // update the parent to match the request.

            console.log(`Useing Cached Content Object for ${contentKey} (ADC)`);

        }
        
        if ( contentValue.preLoad )
            contentRequest.Load();

    }

}

HandleAdditinalContent = function( contentObj, contentKey ){

    if ( !contentObj.Usable() )
        return;

    contentObj.UpdateHTMLElement();

}

HTTPErrorHandler = function( errorContentObject )
{
    console.error( `An Error Occurred load content from ${errorContentObject.url} (resopnce: ${errorContentObject.responceStatus})` );

    // TEMP FIX: for now until i get round to making it async
    // the parent must still be called. 
    // (any error elements just get ignored. what they dont know wont kill em)
    if ( errorContentObject.parent != null )
        errorContentObject.parent.callback( errorContentObject.parent )

}

UseContent = function( contentKey )
{
    /** Uses caches content in additinalContent */

    if ( !(contentKey in contentCache.additinalContent) )
    {
        console.error( `No Content Found for ${contentKey}` );
        return;
    }

    var content = contentCache.additinalContent[ contentKey ];
    content.Use()

}

SetLoading = function(){
    contentElement.innerHTML = "<p class='loading' id='loading-icon' ><img src='./includes/images/loading.svg' width='50px' /><br />Loading</p>"
}

window.onhashchange = LoadContent;

SetLoading();
LoadTemplate( "error", null);
LoadContent();

// update the foot year
document.getElementById("year").innerHTML = Common.Year();
