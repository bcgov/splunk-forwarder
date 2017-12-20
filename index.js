// dependencies
var winston = require('winston');
var bodyParser = require('body-parser');
var app = require('express')();

// SplunkLogger
var SplunkLogger = require("./splunklogger");
var utils = require("./utils");

// where to listen
var SERVICE_IP = process.env.SERVICE_IP || '0.0.0.0';
var SERVICE_PORT = process.env.SERVICE_PORT || 5040;

// log level for this service
var LOG_LEVEL = process.env.LOG_LEVEL || "debug";

// Generate token for Splunk
// -- TBD if this can be used by the server
if (process.env.USE_AUTH_TOKEN &&
    process.env.USE_AUTH_TOKEN == "true" &&
    process.env.AUTH_TOKEN_KEY &&
    process.env.AUTH_TOKEN_KEY.length > 0) {

    var signingToken = process.env.AUTH_TOKEN_KEY);
    winston.debug("Signing token: " + signingToken);
}

// Logger init
winston.level = LOG_LEVEL;
winston.remove(winston.transports.Console);
winston.add(winston.transports.Console, {'timestamp': true});

// Config logger
var config = {
   token = signingToken,
   url = process.env.SPLUNK_SERVER_URL
};

// Create a new logger
var Logger = new SplunkLogger(config);
Logger.error = function(err, context) {
   winston.error(`SplunkLogger error:` + err + `  context:` + context);
};

// Init app
app.use(bodyParser.json());
var args = process.argv;
if (args.length == 3 && args[2] == 'server') {
    var server = app.listen(SERVICE_PORT, SERVICE_IP, function () {
        var host = server.address().address;
        var port = server.address().port;
        winston.info(`MyGov Captcha Service listening at http://${host}:${port}`);
        winston.info(`Log level is at: ${LOG_LEVEL}`);
    });
}

// get a log
var getLog = function (logPayload) {
   winston.debug(`getLog: ${logPayload}`);

   return new Promise(function (resolve, reject) {

      var payload = {
         message: {
            log: logPayload
         },
         metadata: {
            sourceIP: "TBD",
            browserType: "TBD",
            etc: "TBD"
         },
         severity: "info"
      };
      winston.debug(`sending payload`);
      Logger.send(payload, function(err, resp, body) {
         winston.log("Response from Splunk Server", body);
      });
 
      // create basic response
      var responseBody = {
	  // TBD
      };
      resolve(responseBody);
   }, function (err) {
      winston.error(err);
      resolve({valid: false});
   });
};
exports.getLog = getLog;

app.post('/log', function (req, res) {
   getLog(req.body)
      .then(function (body) {
          winston.debug(`returning: OK`);
          return res.send(responseBody);
      });
});

winston.info(`Splunk Forwarder started on host:` +  SERVER_IP + `  port: ` + SERVER_PORT.green.bold);
