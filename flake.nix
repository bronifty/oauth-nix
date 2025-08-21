{
  description = "Nginx proxy server for OAuth development";

  inputs = {
    nixpkgs.url = "github:NixOS/nixpkgs/nixos-unstable";
    flake-utils.url = "github:numtide/flake-utils";
  };

  outputs = { self, nixpkgs, flake-utils }:
    flake-utils.lib.eachDefaultSystem (system:
      let
        pkgs = nixpkgs.legacyPackages.${system};
        
        # Import modules
        nginxConfig = import ./nix/modules/nginx.nix { inherit pkgs; };
        scripts = import ./nix/modules/scripts.nix { inherit pkgs nginxConfig; };

      in {
        packages.default = scripts.nginxProxy;
        
        packages = {
          nginx-config = nginxConfig;
          nginx-proxy = scripts.nginxProxy;
        };
      });
}
