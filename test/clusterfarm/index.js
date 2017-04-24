var mysql = require('../../index.js')
var async = require('async')
var clusterFarm = mysql.createPoolClusterFarm({
	debug:1
})
var config = require('./config.json')
var db_config = config.masters
if (!db_config.length) throw new Error('Server information not passed in from the config file.')

async.series([
	// Setup Test
	cb => {
		async.timesSeries(db_config.length,(i,next) => {
			var master = db_config[i]
			var master_name = 'MASTER'+i
			clusterFarm.addMaster(master_name,{
				host:master.host,
				user:master.user,
				password:master.password,
				database:master.database
			})
			async.timesSeries(db_config[i].slaves.length,(j,next2) => {
				var slave = db_config[i].slaves[j]
				var slave_name = 'SLAVE'+i+'-'+j
				clusterFarm.addSlave(slave_name,master_name,{
					host:slave.host,
					user:slave.user,
					password:slave.password,
					database:slave.database
				})
				return next2()
			},next)
		},cb)
	},
	// Querying to handle data.
	cb => {
		console.log(clusterFarm._servers)
	}
],() => {
	console.log('Finished!')
})