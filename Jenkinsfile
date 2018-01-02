def APP_NAME = 'splunk-forwarder'
def APP_VERSION = 'master'
def TAG_NAME = ['dev', 'test', 'prod']

def BUILD_CONFIG = APP_NAME + '-' + APP_VERSION + '-build'
def IMAGESTREAM_NAME = APP_NAME + '-' + APP_VERSION

node {

    // stage('checkout') {
    //    echo "checking out source"
    //    echo "Build: ${BUILD_ID}"
    //    checkout scm   
    // }

    // stage('code quality check') {
    //    echo "Code Quality Check ...."
    //    SONARQUBE_PWD = sh (
    //          script: 'oc env dc/sonarqube --list | awk  -F  "=" \'/SONARQUBE_ADMINPW/{print $2}\'',
    //          returnStdout: true).trim()
    //    SONARQUBE_URL = sh (
    //          script: 'oc get routes -o wide --no-headers | awk \'/sonarqube/{ print match($0,/edge/) ?  "https://"$2 : "http://"$2 }\'',
    //            returnStdout: true).trim()
    //    dir('sonar-runner') {
    //      sh returnStdout: true, script: "./gradlew sonarqube -Dsonar.host.url=${SONARQUBE_URL} -Dsonar.verbose=true --stacktrace --info  -Dsonar.sources=.."
    //    }
    // }

    stage('build') {
       echo "Building: " + BUILD_CONFIG
       openshiftBuild bldCfg: BUILD_CONFIG, showBuildLogs: 'true'
       openshiftTag destStream: IMAGESTREAM_NAME, verbose: 'true', destTag: '$BUILD_ID', srcStream: IMAGESTREAM_NAME, srcTag: 'latest'
    }

    stage('deploy-' + TAG_NAMES[0]) {
       echo "Deploying to: " + TAG_NAMES[0]
       echo "tag source " + IMAGESTREAM_NAME + " with tag " + '$BUILD_ID' + " to dest " + IMAGESTREAM_NAME
       openshiftTag destStream: IMAGESTREAM_NAME, verbose: 'true', destTag: TAG_NAMES[0], srcStream: IMAGESTREAM_NAME, srcTag: '$BUILD_ID'
    }
}

node {
  stage('deploy-' + TAG_NAMES[1]) {
    input "Deploy to " + TAG_NAMES[1] + "?"
    openshiftTag destStream: IMAGESTREAM_NAME, verbose: 'true', destTag: TAG_NAMES[1], srcStream: IMAGESTREAM_NAME, srcTag: '$BUILD_ID'
  }
}

node {
  stage('deploy-'  + TAG_NAMES[2]) {
    input "Deploy to " + TAG_NAMES[2] + "?"
    openshiftTag destStream: IMAGESTREAM_NAME, verbose: 'true', destTag: TAG_NAMES[2], srcStream: IMAGESTREAM_NAME, srcTag: '$BUILD_ID'
  }
}

