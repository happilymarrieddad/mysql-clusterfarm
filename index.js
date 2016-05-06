var Classes = Object.create(null)

/**
* Create a new Cluster object
* @param { object } config
* @public
*/
exports.createCluster = function createCluster() {
	var Cluster = loadClass('cluster')

	return new Cluster()
}

/**
* Load the given class.
* @private
*/
function loadClass(class_name) {
	var Class = Classes[class_name]

	if (Class !== undefined) {
		return Class
	}

	switch(class_name) {
		case 'cluster':
			Class = require('./lib/Cluster')
			break;
		default:
			throw new Error('Unable to locate class \'' + class_name + '\'')
			break;
	}

	Classes[class_name] = Class

	return Class
}

module.exports.version = '0.1.4'