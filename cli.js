#!/usr/bin/env node

const path = require("path");
const fs = require("fs");
const program = require("commander");
const Git = require("nodegit");
const octokit = require("@octokit/rest")();
const homedir = require("os").homedir();
const inquirer = require("inquirer");

require("dotenv").config({
  path: path.join(homedir, ".na-generator")
});

// receive commands
program
  .version("0.0.1", "-v, --version")
  .command("setup <slug>")
  .description("Setup a new dataviz project with specified slug")
  .option("-d, --directory [dir]", "The install path for your new app")
  .action(async function(slug, options) {
    if (!slug) {
      console.log("You need to speficy a project name");
      return;
    }
    const dir = path.join(options.directory || __dirname, slug);
    await authenticateToGithub();
    const repo = await cloneBoilerplate(dir);
    await replaceProjectName(dir);
    const url = await createNewRepoInOrg(slug);
    const remote = await changeRemoteUrl(repo, dir, url);
    await initNewProjectWithCommit(repo, remote, dir);
    await installDependencies();
  });

program.parse(process.argv);

// authenticate with github, save oauth token to "./.auth"
async function authenticateToGithub() {
  let accessToken = process.env.NA_GITHUB_ACCESS_TOKEN;
  if (!accessToken) {
    // authenticate to Github and get access token
    const { username, password, otp } = await inquirer.prompt([
      { type: "input", name: "username", message: "Github username: " },
      {
        type: "password",
        name: "password",
        message: "Github password: "
      },
      {
        type: "input",
        name: "otp",
        message: "2-factor authentication code: "
      }
    ]);

    octokit.authenticate({
      type: "basic",
      username,
      password
    });

    const {
      data: { token }
    } = await octokit.authorization.createAuthorization({
      note: "CLI to generate New America dataviz projects",
      scopes: "repo",
      headers: {
        "x-github-otp": otp
      }
    });

    fs.writeFile(
      path.join(homedir, ".na-generator"),
      `NA_GITHUB_ACCESS_TOKEN=${token}`,
      err => {
        if (err) throw err;
        console.log("Github access token saved for the future");
      }
    );
    name = username;
    accessToken = token;
  }
  octokit.authenticate({
    type: "token",
    token: accessToken
  });
}

// clone boilerplate into dir
async function cloneBoilerplate(dir) {
  if (!fs.existsSync(path.join(dir, ".git"))) {
    const newRepo = await Git.Clone(
      "https://github.com/newamerica-graphics/data-viz-boilerplate.git",
      dir
    );
    return newRepo;
  } else {
    console.log("Directory already exists");
    const existingRepo = Git.Repository.open(dir);
    return existingRepo;
  }
}

// replace "data_viz_project_template" in package.json with input name
async function replaceProjectName(dir, slug) {
  const packageJson = path.join(dir, "package.json");
  fs.readFile(packageJson, "utf-8", function(err, data) {
    if (err) throw err;
    const newValue = data.replace("data_viz_project_template", slug);
    fs.writeFile(packageJson, newValue, "utf-8", function(err) {
      if (err) throw err;
      console.log("Scaffolding your project");
    });
  });
}

// create new repo in newamerica-graphics with input name
async function createNewRepoInOrg(slug) {
  try {
    const checkRepo = await octokit.repos.get({
      owner: "newamerica-graphics",
      repo: slug
    });
    return checkRepo.data.clone_url;
  } catch (error) {
    if (error.status === 404) {
      const createRepo = await octokit.repos.createInOrg({
        org: "newamerica-graphics",
        name: slug
      });
      return createRepo.data.clone_url;
    }
  }
}

// change git remote to new repo url
async function changeRemoteUrl(repo, dir, newUrl) {
  const remote = await Git.Remote.lookup(repo, "origin");
  const remoteUrl = remote.url();
  if (remoteUrl !== newUrl) {
    await Git.Remote.setUrl(repo, "origin", url);
  }
  return remote;
}

// commit name change
async function initNewProjectWithCommit(repo, remote, dir) {
  const packageJson = path.join(dir, "package.json");
  const user = await Git.Config.openDefault().then(function(config) {
    return config.getStringBuf("user.name");
  });
  const email = await Git.Config.openDefault().then(function(config) {
    return config.getStringBuf("user.email");
  });
  const signature = Git.Signature.now("test", email);
  const stage = await repo.stageFilemode("package.json", true);
  const commit = await repo.createCommitOnHead(
    ["package.json"],
    signature,
    signature,
    "project init"
  );
  try {
    await remote.push(["refs/heads/master:refs/heads/master"], {
      callbacks: {
        credentials: function(url, userName) {
          // avoid infinite loop when authentication agent is not loaded
          console.log(url, userName);
          return git.Cred.sshKeyFromAgent(userName);
        },
        certificateCheck: function() {
          return 1;
        }
      }
    });
  } catch (err) {
    console.log(err);
  }
}

// install deps in new project
async function installDependencies() {}
