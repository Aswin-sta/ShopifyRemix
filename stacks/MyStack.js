
import { RemovalPolicy } from "aws-cdk-lib";
import { SecurityGroup, Vpc } from "aws-cdk-lib/aws-ec2";
import { RDS, RemixSite } from "sst/constructs";

const ShopifyApp = (context) => {
    const {app, stack} = context;
    
    /**
     * Create a VPC with a single NAT gateway
     * 
     * @param {Stack} stack
     * @param {App} app
     * @returns {Vpc}
     */
    const vpc = new Vpc(stack, app.logicalPrefixedName('net'), { natGateways: 1 });

    /**
     * Create a default security group for lambda functions
     * 
     * @param {Stack} stack
     * @returns {SecurityGroup}
     */
    const defaultLambdaSecurityGroup = new SecurityGroup(stack, 'DefaultLambda', {
        vpc: vpc,
        description: 'Default security group for lambda functions',
    });

    /**
     * Set the default function props
     */
    app.setDefaultFunctionProps({
        vpc: vpc,
        securityGroups: [defaultLambdaSecurityGroup],
    });

    /**
     * Create an RDS instance
     * @param {Stack} stack
     * @returns {RDS}
     */
    const rds = new RDS(stack, "db", {
        cdk: {
            cluster: {
            vpc: vpc,
            removalPolicy: RemovalPolicy.SNAPSHOT,
            securityGroups: [defaultLambdaSecurityGroup]
            },
        },
        engine: "mysql5.7",
        defaultDatabaseName: 'shopify_app_database_' + (app.stage ? app.stage.toLowerCase() : 'dev'),
        migrations: "app/db/migrations",
    });

    rds.cdk.cluster.connections.allowDefaultPortFrom(defaultLambdaSecurityGroup, 'Allow access from lambda functions');

    app.addDefaultFunctionPermissions([rds]);

    /**
     * Create a Remix site
     * 
     * @param {Stack} stack
     * @returns {RemixSite}
     */
    const site = new RemixSite(stack, "site", {
    runtime: "nodejs20.x",
    cdk: {
        server: {
        vpc: vpc,
        securityGroups: [defaultLambdaSecurityGroup]
        }    
    },
    bind: [rds],
    environment: {
      SHOPIFY_APP_URL: process.env.SHOPIFY_APP_URL || "", 
      SHOPIFY_API_KEY: process.env.SHOPIFY_API_KEY || "",
      SHOPIFY_API_SECRET: process.env.SHOPIFY_API_SECRET || "",
      SCOPES: process.env.SCOPES || "",
      DB_HOST: process.env.DB_HOST || "",
      DB_NAME: process.env.DB_NAME || "",
      DB_USERNAME: process.env.DB_USERNAME || "",
      DB_PASSWORD: process.env.DB_PASSWORD || "",
      DB_PORT: process.env.DB_PORT || "",
      }    
    });

    stack.addOutputs({
        url: site.url,
    });    
};

export default ShopifyApp;