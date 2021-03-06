'use strict';

const expect = require('chai').expect;
const sinon = require('sinon');
const { Topology } = require('../../src/sdam/topology');

describe('URI', function () {
  it('should correctly allow for w:0 overriding on the connect url', {
    // Add a tag that our runner can trigger on
    // in this case we are setting that node needs to be higher than 0.10.X to run
    metadata: { requires: { topology: 'single' } },

    test: function (done) {
      var self = this;

      // Connect using the connection string
      const client = this.configuration.newClient(
        'mongodb://localhost:27017/integration_tests?w=0'
      );

      client.connect(function (err, client) {
        expect(err).to.not.exist;
        var db = client.db(self.configuration.db);

        db.collection('mongoclient_test').update({ a: 1 }, { b: 1 }, { upsert: true }, function (
          err,
          result
        ) {
          expect(err).to.not.exist;

          if (result) {
            expect(result.result.ok).to.equal(1);
          } else {
            expect(result).to.be.null;
          }

          client.close(done);
        });
      });
    }
  });

  it('should correctly connect via domain socket', {
    // Add a tag that our runner can trigger on
    // in this case we are setting that node needs to be higher than 0.10.X to run
    metadata: { requires: { topology: 'single' } },

    test: function (done) {
      if (process.platform === 'win32') {
        return done();
      }

      const client = this.configuration.newClient(
        'mongodb://%2Ftmp%2Fmongodb-27017.sock?safe=false'
      );

      client.connect(function (err, client) {
        expect(err).to.not.exist;
        client.close(done);
      });
    }
  });

  it('should correctly connect via normal url using ip', {
    // Add a tag that our runner can trigger on
    // in this case we are setting that node needs to be higher than 0.10.X to run
    metadata: { requires: { topology: 'single' } },

    test: function (done) {
      const client = this.configuration.newClient('mongodb://127.0.0.1:27017/?fsync=true');
      client.connect((err, client) => {
        var db = client.db(this.configuration.db);
        expect(db.writeConcern.fsync).to.be.true;
        client.close(done);
      });
    }
  });

  it('should correctly connect using uri encoded username and password', {
    // Add a tag that our runner can trigger on
    // in this case we are setting that node needs to be higher than 0.10.X to run
    metadata: { requires: { topology: 'single' } },

    test: function (done) {
      var self = this;
      const configuration = this.configuration;
      const client = configuration.newClient('mongodb://localhost:27017/integration_tests', {
        native_parser: true
      });

      client.connect(function (err, client) {
        expect(err).to.not.exist;
        var user = 'u$ser',
          pass = '$specialch@rs';
        var db = client.db(self.configuration.db);

        db.addUser(user, pass, function (err) {
          expect(err).to.not.exist;
          var uri =
            'mongodb://' +
            encodeURIComponent(user) +
            ':' +
            encodeURIComponent(pass) +
            '@localhost:27017/integration_tests';

          const aclient = configuration.newClient(uri, { native_parser: true });
          aclient.connect(function (err, aclient) {
            expect(err).to.not.exist;

            client.close(() => aclient.close(done));
          });
        });
      });
    }
  });

  it('should correctly translate uri options using new parser', {
    metadata: { requires: { topology: 'replicaset' } },
    test: function (done) {
      const config = this.configuration;
      const uri = `mongodb://${config.host}:${config.port}/${config.db}?replicaSet=${config.replicasetName}`;

      const client = this.configuration.newClient(uri, { useNewUrlParser: true });
      client.connect((err, client) => {
        if (err) console.dir(err);
        expect(err).to.not.exist;
        expect(client).to.exist;
        expect(client.s.options.replicaSet).to.exist.and.equal(config.replicasetName);
        client.close(done);
      });
    }
  });

  it('should generate valid credentials with X509 and the new parser', {
    metadata: { requires: { topology: 'single' } },
    test: function (done) {
      function validateConnect(options /*, callback */) {
        expect(options).to.have.property('credentials');
        expect(options.credentials.mechanism).to.eql('x509');

        connectStub.restore();
        done();
      }

      const topologyPrototype = Topology.prototype;
      const connectStub = sinon.stub(topologyPrototype, 'connect').callsFake(validateConnect);
      const uri = 'mongodb://some-hostname/test?ssl=true&authMechanism=MONGODB-X509&replicaSet=rs0';
      const client = this.configuration.newClient(uri, { useNewUrlParser: true });
      client.connect();
    }
  });
});
