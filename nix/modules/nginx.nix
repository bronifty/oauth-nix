{ pkgs }:

let
  # Read the nginx configuration template and substitute the nginx path
  nginxConfigTemplate = builtins.readFile ../config/nginx.conf;
  nginxConfigContent = builtins.replaceStrings ["@nginx@"] ["${pkgs.nginx}"] nginxConfigTemplate;
in

pkgs.writeText "nginx.conf" nginxConfigContent
