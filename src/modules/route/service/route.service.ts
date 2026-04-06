import { Injectable } from "@nestjs/common";
import { compact } from "lodash";
import { AppRoute } from "../entity";
import { about, access, home, outside, personalCenter, routeNest } from "../extra-info/order";
import { ProjectManagementRouteService } from "./project-management";
import { SystemManagementService } from "./system-management";

const aboutRouter = {
  path: "/about",
  component: "/about/index.tsx",
  handle: {
    icon: "CopyrightOutlined",
    title: "common.menu.about",
    order: about,
  },
};

const outsideRouter = {
  path: "/outside",
  handle: {
    icon: "OutsidePageIcon",
    title: "common.menu.outside",
    order: outside,
  },
  children: [
    {
      path: "/outside/embedded",
      handle: {
        icon: "EmbeddedIcon",
        title: "common.menu.embedded",
      },
      children: [
        {
          path: "/outside/embedded/ant-design",
          handle: {
            icon: "AntDesignOutlined",
            title: "common.menu.antd",
            iframeLink: "https://ant.design/",
          },
        },
        {
          path: "/outside/embedded/project-docs",
          handle: {
            icon: "ContainerOutlined",
            title: "common.menu.projectDocs",
            iframeLink: "https://condorheroblog.github.io/react-antd-admin/docs/",
          },
        },
      ],
    },
    {
      path: "/outside/external-link",
      handle: {
        icon: "ExternalIcon",
        title: "common.menu.externalLink",
      },
      children: [
        {
          path: "/outside/external-link/react-docs",
          handle: {
            icon: "RiReactjsLine",
            title: "common.menu.reactDocs",
            externalLink: "https://react.dev/",
          },
        },
      ],
    },
  ],
};

const personalCenterRouter = {
  path: "/personal-center",
  handle: {
    order: personalCenter,
    title: "common.menu.personalCenter",
    icon: "RiAccountCircleLine",
  },
  children: [
    {
      path: "/personal-center/my-profile",
      handle: {
        title: "common.menu.profile",
        icon: "ProfileCardIcon",
      },
    },
    {
      path: "/personal-center/settings",
      handle: {
        title: "common.menu.settings",
        icon: "RiUserSettingsLine",
      },
    },
  ],
};

const routeNestRouter = {
  path: "/route-nest",
  handle: {
    order: routeNest,
    title: "common.menu.nestMenus",
    icon: "NodeExpandOutlined",
  },
  children: [
    {
      path: "/route-nest/menu1",
      handle: {
        title: "common.menu.menu1",
        icon: "SisternodeOutlined",
      },
      children: [
        {
          path: "/route-nest/menu1/menu1-1",
          handle: {
            title: "common.menu.menu1-1",
            icon: "SubnodeOutlined",
          },
        },
        {
          path: "/route-nest/menu1/menu1-2",
          handle: {
            title: "common.menu.menu1-2",
            icon: "SubnodeOutlined",
          },
        },
      ],
    },
    {
      path: "/route-nest/menu2",
      handle: {
        title: "common.menu.menu2",
        icon: "SubnodeOutlined",
      },
    },
  ],
};

@Injectable()
export class RouteService {
  constructor(
    private readonly systemManagementRouteService: SystemManagementService,
    private readonly projectManagementRouteService: ProjectManagementRouteService
  ) {}

  /**Get route by use */

  handleGetRouteWithPermission(): AppRoute[] {
    // cứ để true đã, sau sẽ sửa sang permission nào có quyền gì
    const isAdmin = true;

    const accessRouter = {
      path: "/access",
      handle: {
        icon: "SafetyOutlined",
        title: "common.menu.access",
        order: access,
      },
      children: [
        /**
         * @zh 通过接口获取路由时可见
         * @en Visible only when getting routes through the interface
         */
        {
          path: "/access/access-mode",
          handle: {
            icon: "CloudOutlined",
            title: "common.menu.accessMode",
          },
        },
        {
          path: "/access/page-control",
          handle: {
            icon: "FileTextOutlined",
            title: "common.menu.pageControl",
          },
        },
        {
          path: "/access/button-control",
          handle: {
            icon: "LockOutlined",
            title: "common.menu.buttonControl",
            permissions: isAdmin
              ? [
                  "permission:button:get",
                  "permission:button:update",
                  "permission:button:delete",
                  "permission:button:add",
                ]
              : ["permission:button:get"],
          },
        },
        isAdmin
          ? {
              path: "/access/admin-visible",
              handle: {
                icon: "EyeOutlined",
                title: "common.menu.adminVisible",
              },
            }
          : {
              path: "/access/common-visible",
              handle: {
                icon: "EyeOutlined",
                title: "common.menu.commonVisible",
              },
            },
      ],
    };

    const homeRouter = {
      path: "/home",
      component: "/home/index.tsx",
      handle: {
        icon: "HomeOutlined",
        title: "common.menu.home",
        order: home,
      },
    };

    const systemManagementRouter = this.systemManagementRouteService.getRouteUserManagement();
    const projectManagementRouter = this.projectManagementRouteService.getRouteProjectManagement();
    return compact([
      homeRouter,
      accessRouter,
      aboutRouter,
      projectManagementRouter,
      systemManagementRouter,
      outsideRouter,
      personalCenterRouter,
      routeNestRouter,
    ]);
  }
}
