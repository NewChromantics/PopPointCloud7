#version 300 es
//#define MULTI_VIEW

#if defined(MULTI_VIEW)
#extension GL_OVR_multiview : require
layout(num_views=2) in;
//	gr: popengine writes these automatically (these could be up to 15 for... caves?)
uniform mat4 Pop_CameraWorldToCameraTransforms[2];
uniform mat4 Pop_CameraProjectionTransforms[2];

//	gl_ViewID_OVR is keyword which dictates which eye is being rendered (0,1,etc)
#define WorldToCameraTransform		( Pop_CameraWorldToCameraTransforms[gl_ViewID_OVR] )
#define CameraProjectionTransform	( Pop_CameraProjectionTransforms[gl_ViewID_OVR] )
#endif

in vec3 LocalPosition;
in vec3 LocalUv;
in vec3 LocalNormal;
out vec3 FragWorldPosition;
out vec3 FragLocalPosition;
out vec2 FragLocalUv;
out vec3 FragCameraPosition;	//	position in camera space
out vec2 FragViewUv;
out vec3 ClipPosition;
//out vec4 FragColour;
out vec2 FragColourUv;
out vec2 FragDepthUv;
out vec3 FragLocalNormal;
out vec3 FragWorldNormal;


#if !defined(WorldToCameraTransform)
uniform mat4 WorldToCameraTransform;
uniform mat4 CameraProjectionTransform;
#endif


//	uv -> camera space
uniform mat4 DepthViewToCameraTransform;
uniform mat4 DepthCameraToWorldTransform;
uniform mat4 LocalToWorldTransform;
uniform sampler2D DepthImage;
uniform vec4 DepthImageCrop;	//	this crop = rect of original
uniform vec4 DepthImageRect;	//	cropping rect
in vec2 VoxelUv;
uniform float VoxelSize;
uniform vec2 DepthCamera_focalLength;
uniform vec2 DepthCamera_principalPoint;
uniform vec2 DepthCamera_imageDimensions;
uniform float DepthCamera_maxdepth;
uniform float DepthCamera_mindepth;

//#define ROTATE_SAMPLE

vec2 GetColourUv(vec2 Uv)
{
	Uv = VoxelUv;
#if defined(ROTATE_SAMPLE)
	Uv = Uv.yx;
	Uv.y = 1.0 - Uv.y;
#endif

	vec2 Min = DepthImageRect.xy;
	vec2 Max = DepthImageRect.xy + DepthImageRect.zw;
	
	Max.y = mix( Min.y, Max.y, 0.5 );
	
	vec2 DepthUv = mix( Min, Max, Uv );
	return DepthUv;
}

vec2 GetDepthUv(vec2 Uv)
{
	Uv = VoxelUv;
#if defined(ROTATE_SAMPLE)
	Uv = Uv.yx;
	Uv.y = 1.0 - Uv.y;
#endif
	vec2 Min = DepthImageRect.xy;
	vec2 Max = DepthImageRect.xy + DepthImageRect.zw;
	
	Min.y = mix( Min.y, Max.y, 0.5 );
	
	vec2 DepthUv = mix( Min, Max, Uv );
	return DepthUv;
}

float Range(float Min,float Max,float Value)
{
	return (Value-Min) / (Max-Min);
}

void RainbowToNormalAndScore(out float Normal,out float Score,vec3 Rainbow)
{
	//	probbaly a smart way to do this
	//	one component is always 1.0 and one is always 0.0
	float r = Rainbow.x;
	float g = Rainbow.y;
	float b = Rainbow.z;

	float Tolerance = 45.0;
	bool rzero = (r<=Tolerance/255.0);
	bool gzero = (g<=Tolerance/255.0);
	bool bzero = (b<=Tolerance/255.0);
	if ( rzero && gzero && bzero )
	{
		Score = 0.0;
		Normal = 0.0;
		return;
	}

	if ( bzero )
	{
		//	red to green
		Normal = Range(1.0,0.0,r) + Range(0.0,1.0,g);
		Normal /= 2.0;
		Normal = mix( 0.0, 0.333, Normal );
		Score = 1.0;
	}
	else if ( rzero )
	{
		//	green to blue
		Normal = Range(1.0,0.0,g) + Range(0.0,1.0,b);
		Normal /= 2.0;
		Normal = mix( 0.333, 0.666, Normal );
		Score = 1.0;
	}
	else if ( gzero )
	{
		//	blue to red
		Normal = Range(1.0,0.0,b) + Range(0.0,1.0,r);
		Normal /= 2.0;
		Normal = mix( 0.666, 1.0, Normal );
		Score = 1.0;
	}
	else
	{
		Normal = 0.0;
		Score = 0.5;
	}
}


//	camera depth = 0...1 (or -1 to 1?)
float RainbowToCameraDepth(vec3 Rgb)
{
	float Score;
	float Normal;
	RainbowToNormalAndScore(Normal,Score,Rgb);
	Normal *= 1.0;
	return Normal;
}

#define MAKE_WORLD_TRANSFORM
uniform float TimeSecs;

mat4 GetLocalToWorldTransform()
{
#if !defined(MAKE_WORLD_TRANSFORM)
	return DepthViewToWorldTransform;
#else
	//LocalPos.xy = mix( DepthImageCrop.xy, DepthImageCrop.xy+DepthImageCrop.zw, LocalPos.xy );
	//LocalPos.z = 1.0;
/*
	mat4 AxisConversion1 = mat4
	(
		0,-1,0,0,
		1,0,0,0,
		0,0,1,0,
		0,0,0,1
	);
	vec4 SampleUv4 = AxisConversion1 * vec4(VoxelUv,0,0);
	vec2 SampleUv = SampleUv4.xy/SampleUv4.ww;
	*/

	vec2 DepthUv = GetDepthUv( VoxelUv );
	vec4 DepthRainbow = texture( DepthImage, DepthUv );
	float CameraDepth = RainbowToCameraDepth(DepthRainbow.xyz);

	float Time01 = mod(TimeSecs*0.1,1.0);
	//CameraDepth = CameraDepth * mod(TimeSecs,1.0);

	vec4 Crop = DepthImageCrop;
	//	get projected position
	//	needs axis conversion... but it shouldn't? this should be sorted in the matrix
	//	plus, the axis conversion should be in world space, not the projection
	vec3 ViewPosition = vec3( VoxelUv, 1.0 );
	//ViewPosition.xy = mix( Crop.xy, Crop.xy+Crop.zw, ViewPosition.xy );
	
	//ViewPosition.x = 1.0 - ViewPosition.x;
	ViewPosition.xy = ViewPosition.yx;
	ViewPosition.y = 1.0 - ViewPosition.y;
/*
	vec4 Crop = DepthImageCrop;
	Crop.xy = Crop.yx;
	Crop.y = 1.0 - Crop.y;
*/
	//	gr: I think this crop is the wrong way round, we have some fat images which should be much thinner
	ViewPosition.xy = mix( Crop.xy, Crop.xy+Crop.zw, ViewPosition.xy );

	
	ViewPosition = mix( vec3(-1), vec3(1), ViewPosition );
	//ViewPosition.xy = mix( vec2(-1), vec2(1), ViewPosition.xy );
	//ViewPosition.z = 1.0;
	//ViewPosition.z *= mod(TimeSecs,3.0);
	
	vec4 CameraPosition = DepthViewToCameraTransform * vec4(ViewPosition,1.0);
	
	CameraPosition.xyz /= CameraPosition.www;
	CameraPosition.z *= CameraDepth;
	CameraPosition.w = 1.0;
	
	//CameraPosition.z *= mod(TimeSecs,3.0);
	
	vec4 WorldPosition = DepthCameraToWorldTransform * CameraPosition;
	



	//	https://github.com/juniorxsound/Depthkit.js/blob/master/src/shaders/rgbd.vert#L127
	vec2 SampleUv = VoxelUv;
#if defined(ROTATE_SAMPLE)
	
	SampleUv.xy = SampleUv.yx;
	//SampleUv.x = 1.0-SampleUv.x;
	//SampleUv.y = 1.0-SampleUv.y;
#endif
	vec4 crop = DepthImageCrop;
	vec2 DepthImageTextureSize = vec2(textureSize(DepthImage,0));
	//vec2 DepthImageTextureSize = DepthImageRect.zw * vec2(textureSize(DepthImage,0));
	DepthImageTextureSize = DepthCamera_imageDimensions;
	//DepthImageTextureSize = (DepthImageRect.zw*0.5) * DepthImageTextureSize;
	float width = DepthImageTextureSize.x;
	float height = DepthImageTextureSize.y;
	vec4 texSize = vec4(1.0 / width, 1.0 / height, width, height);
	//vec2 centerpix = texSize.xy * .5;
	//vec2 textureStep = 1.0 / meshDensity;
	//vec2 basetex = floor(position.xy * textureStep * texSize.zw) * texSize.xy;
	vec2 basetex = floor(SampleUv.xy * texSize.zw) * texSize.xy;
	vec2 imageCoordinates = crop.xy + (basetex * crop.zw);
	basetex.y = 1.0 - basetex.y;
	
	//imageCoordinates.xy = imageCoordinates.yx;
	//imageCoordinates.y = 1.0-imageCoordinates.y;
	//imageCoordinates.x = 1.0-imageCoordinates.x;

	//CameraDepth=0.0;
	float z = CameraDepth * (DepthCamera_maxdepth - DepthCamera_mindepth) + DepthCamera_mindepth;
	z *= -1.0;
	WorldPosition = DepthCameraToWorldTransform * vec4((imageCoordinates * DepthCamera_imageDimensions - DepthCamera_principalPoint) * z / DepthCamera_focalLength, z, 1.0);
	WorldPosition.xyz /= WorldPosition.www;
	WorldPosition.w = 1.0;
	
	
	
	
	
	//	gr: should this transform be rotated (to depth camera's local to world rotation matrix)...
	mat4 Transform = mat4( 1,0,0,0,
							0,1,0,0,	
							0,0,1,0,	
							WorldPosition );
	//Transform = DepthViewToWorldTransform;
	//Transform[3] = WorldPosition;
	
	return Transform;
#endif
}



vec3 GetWorldPos(mat4 LocalToWorldTransform)
{
	vec3 LocalPos = LocalPosition * VoxelSize;
	//LocalPos.z *= 0.001;
#if !defined(MAKE_WORLD_TRANSFORM)
	float z = 0.0;
	LocalPos = vec3(VoxelUv,z) + LocalPos;
	//LocalPos = vec3(0,0,0) + LocalPos;
	//LocalPos.xy = mix( DepthImageCrop.xy, DepthImageCrop.xy+DepthImageCrop.zw, LocalPos.xy );
	
	//	need to put this transform into the matrix as it's current a view->world
	LocalPos = mix( vec3(-1), vec3(1), LocalPos );
#endif
	vec4 WorldPos = LocalToWorldTransform * vec4(LocalPos,1.0);
	WorldPos.xyz /= WorldPos.www;
	WorldPos.w = 1.0;
	
	return WorldPos.xyz;
}


float Range01(float Min,float Max,float Value)
{
	return clamp( Range( Min, Max, Value ), 0.0, 1.0 );
}



void main()
{
	mat4 LocalToWorldTransform = GetLocalToWorldTransform();

	vec3 WorldPos = GetWorldPos(LocalToWorldTransform);
	vec4 CameraPos = WorldToCameraTransform * vec4(WorldPos,1.0);	//	world to camera space
	vec4 ProjectionPos = CameraProjectionTransform * CameraPos;

	vec4 WorldNormal = LocalToWorldTransform * vec4(LocalNormal,0.0);
	WorldNormal.xyz = normalize(WorldNormal.xyz);


	gl_Position = ProjectionPos;
	
	FragViewUv = gl_Position.xy;
	ClipPosition = gl_Position.xyz / gl_Position.www;	//	not sure if this should divide...
	
	FragCameraPosition = CameraPos.xyz ;/// CameraPos.www;
	
	FragWorldPosition = WorldPos.xyz;
	//FragColour = Colour;//LocalPosition;
	FragLocalPosition = LocalPosition;
	FragLocalUv = LocalUv.xy;
	FragColourUv = GetColourUv(VoxelUv);
	FragDepthUv = GetDepthUv(VoxelUv);
	FragColourUv = GetColourUv(LocalUv.xy);
	FragDepthUv = GetDepthUv(LocalUv.xy);
	FragLocalNormal = LocalNormal;
	FragWorldNormal = WorldNormal.xyz;
	
}

