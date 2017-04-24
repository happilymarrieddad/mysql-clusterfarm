var mysql = require('../../index.js')
var config = require('./config.json')
var async = require('async')

var pool = mysql.createPoolClusterFarm({debug:1})

for (var i = 0; i < config.masters.length ; i++) {
	pool.addMaster(`MASTER${i}`,config.masters[i])
	for (var j = 0; j < config.masters[i].slaves.length; j++) {
		pool.addSlave(`SLAVE${j}`,`MASTER${i}`,config.masters[i].slaves[j])
	}
}



async.timesSeries(10,(i,next) => {

	pool.query('SELECT id,first FROM users WHERE id = 1151 LIMIT 1',(err) => {
		return next()
	})

},() => {
	console.log('Finished queries!')
})